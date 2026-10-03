"""Wave 2 — Fail disposition: Quarantine/NCR → RETURN (PRT+DBN stub) or SCRAP (write-off)."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.services.numbering import generate_document_number
from apps.inventory.models import InventoryReceiptLayer, LotStatus
from apps.inventory.services import transition_lot_status
from apps.organization.company_scope import assert_company_allowed
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.warehouse.bin_resolver import resolve_rejected_bin
from apps.warehouse.operations import OpsDocStatus, StockAdjustment
from apps.warehouse.ops_services import post_adjustment


class DispositionError(ERPError):
    default_code = "DISPOSITION_ERROR"


DISPOSE_RETURN = "RETURN"
DISPOSE_SCRAP = "SCRAP"


def _as_decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _write_off_lot(*, lot, reason: str, reference: str, user=None) -> list[str]:
    """Post ADJUSTMENT_OUT for each layer with remaining qty; return adjustment numbers."""
    from apps.quality.qc_services import _move_lot_to_bin

    layers = list(
        InventoryReceiptLayer.objects.select_for_update()
        .filter(lot=lot, remaining_quantity__gt=0)
        .order_by("receipt_sequence")
    )
    adj_numbers: list[str] = []
    for layer in layers:
        qty = _as_decimal(layer.remaining_quantity)
        if qty <= 0:
            continue
        adj = StockAdjustment.objects.create(
            company=lot.company,
            adjustment_number=generate_document_number("ADJ"),
            item=lot.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=layer.warehouse or lot.warehouse,
            bin=layer.bin or lot.bin,
            quantity_delta=-qty,
            uom=lot.uom,
            unit_cost=_as_decimal(lot.landed_unit_cost or lot.purchase_unit_cost),
            reason=reason,
            reference=reference,
            status=OpsDocStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )
        post_adjustment(adjustment=adj, user=user)
        adj_numbers.append(adj.adjustment_number)

    lot.refresh_from_db()
    if lot.status == LotStatus.QUARANTINED:
        transition_lot_status(lot, LotStatus.REJECTED, user=user)
    if lot.warehouse_id:
        dest = resolve_rejected_bin(warehouse=lot.warehouse, user=user)
        _move_lot_to_bin(lot=lot, bin=dest, user=user)
    return adj_numbers


def _find_ncr(*, ncr_code: str | None = None, lot_id=None, inspection: QCInspection | None = None):
    from apps.quality.models import Record

    if ncr_code:
        rec = Record.objects.filter(entity="ncrs", code=ncr_code).first()
        if not rec:
            raise DispositionError(f"NCR {ncr_code} not found.", code="NCR_NOT_FOUND")
        return rec
    if inspection and inspection.ncr_reference:
        rec = Record.objects.filter(entity="ncrs", code=inspection.ncr_reference).first()
        if rec:
            return rec
    if lot_id:
        for rec in Record.objects.filter(entity="ncrs").order_by("-created_at")[:50]:
            fields = rec.fields or {}
            if str(fields.get("lotId") or "") == str(lot_id):
                return rec
    return None


def _create_return_docs(*, lot, inspection: QCInspection | None, ncr, qty: Decimal, user=None) -> dict:
    from apps.procurement.models import Record as ProcRecord

    unit = _as_decimal(lot.landed_unit_cost or lot.purchase_unit_cost)
    amount = (qty * unit).quantize(Decimal("0.01"))
    prt_code = generate_document_number("PRT")
    dbn_code = generate_document_number("DBN")
    supplier_id = str(lot.supplier_id) if lot.supplier_id else ""
    grn_id = str(lot.source_grn_id) if lot.source_grn_id else ""
    common = {
        "lotId": str(lot.id),
        "lotNumber": lot.lot_number,
        "itemId": str(lot.item_id),
        "itemSku": getattr(lot.item, "sku", ""),
        "qty": str(qty),
        "unitCost": str(unit),
        "amount": str(amount),
        "supplierId": supplier_id,
        "grnId": grn_id,
        "ncrCode": ncr.code if ncr else "",
        "inspectionId": str(inspection.id) if inspection else "",
        "currency": getattr(getattr(lot, "currency", None), "code", "") or "NPR",
    }
    ProcRecord.objects.create(
        entity="purchase_returns",
        code=prt_code,
        title=f"Return {lot.lot_number}",
        date=timezone.now().date(),
        status="draft",
        fields={**common, "disposition": DISPOSE_RETURN},
        created_by=user,
        updated_by=user,
    )
    ProcRecord.objects.create(
        entity="debit_notes",
        code=dbn_code,
        title=f"Debit note for {prt_code}",
        date=timezone.now().date(),
        status="draft",
        fields={**common, "purchaseReturn": prt_code, "note": "Draft — GL/VAT posting later"},
        created_by=user,
        updated_by=user,
    )
    return {"purchase_return": prt_code, "debit_note": dbn_code, "amount": str(amount)}


@transaction.atomic
def dispose_failed_material(
    *,
    action: str,
    inspection: QCInspection | None = None,
    ncr_code: str | None = None,
    lot=None,
    user=None,
    remarks: str = "",
) -> dict:
    """
    Manager disposition after QC Fail / Quarantine.
    RETURN → write-off + Purchase Return + Debit Note drafts.
    SCRAP → write-off + lot REJECTED.
    """
    action = (action or "").upper().strip()
    if action not in {DISPOSE_RETURN, DISPOSE_SCRAP}:
        raise DispositionError("action must be RETURN or SCRAP.", code="INVALID_ACTION")

    if inspection is not None:
        inspection = (
            QCInspection.objects.select_for_update()
            .select_related("lot", "lot__item", "lot__warehouse", "lot__supplier", "lot__currency", "item")
            .get(pk=inspection.pk)
        )
        assert_company_allowed(user, inspection.company_id)
        if inspection.status != QCInspectionStatus.FAILED:
            raise DispositionError("Dispose only after QC Fail.", code="NOT_FAILED")
        lot = inspection.lot
    elif lot is not None:
        from apps.inventory.models import InventoryLot

        lot = (
            InventoryLot.objects.select_for_update()
            .select_related("item", "warehouse", "supplier", "currency")
            .get(pk=lot.pk)
        )
        assert_company_allowed(user, lot.company_id)
    else:
        raise DispositionError("inspection or lot is required.", code="MISSING_TARGET")

    if lot.status not in {LotStatus.QUARANTINED, LotStatus.REJECTED}:
        # Allow re-dispose block if already written off (zero remaining + REJECTED)
        rem = _as_decimal(lot.remaining_quantity)
        if lot.status == LotStatus.REJECTED and rem <= 0:
            raise DispositionError("Lot already disposed.", code="ALREADY_DISPOSED")
        if lot.status != LotStatus.QUARANTINED:
            raise DispositionError(
                f"Lot must be QUARANTINED to dispose (current={lot.status}).",
                code="INVALID_LOT_STATUS",
            )

    ncr = _find_ncr(ncr_code=ncr_code, lot_id=lot.id, inspection=inspection)
    if ncr and (ncr.fields or {}).get("disposed"):
        raise DispositionError("NCR already disposed.", code="ALREADY_DISPOSED")

    qty_before = _as_decimal(lot.remaining_quantity)
    if qty_before <= 0 and lot.status == LotStatus.REJECTED:
        raise DispositionError("Nothing left to dispose.", code="ZERO_QTY")

    reason = remarks or (
        f"QC Fail disposition — {action}"
        + (f" ({inspection.inspection_number})" if inspection else "")
    )
    ref = (ncr.code if ncr else "") or (inspection.inspection_number if inspection else lot.lot_number)
    adj_numbers = _write_off_lot(lot=lot, reason=reason, reference=ref, user=user)

    docs: dict = {}
    if action == DISPOSE_RETURN:
        docs = _create_return_docs(lot=lot, inspection=inspection, ncr=ncr, qty=qty_before, user=user)

    if ncr:
        fields = dict(ncr.fields or {})
        fields["disposed"] = True
        fields["disposition"] = action
        fields["disposedAt"] = timezone.now().isoformat()
        fields["adjustmentNumbers"] = adj_numbers
        fields.update({k: v for k, v in docs.items()})
        if remarks:
            fields["dispositionRemarks"] = remarks
        ncr.fields = fields
        ncr.status = "closed"
        ncr.updated_by = user
        ncr.save(update_fields=["fields", "status", "updated_by", "updated_at"])

    if inspection is not None:
        note = f"{inspection.remarks}\nDisposed: {action}".strip() if inspection.remarks else f"Disposed: {action}"
        inspection.remarks = note[:2000]
        inspection.updated_by = user
        inspection.save(update_fields=["remarks", "updated_by", "updated_at"])

    result = {
        "action": action,
        "lot_id": str(lot.id),
        "lot_number": lot.lot_number,
        "lot_status": LotStatus.REJECTED,
        "qty_written_off": str(qty_before),
        "adjustments": adj_numbers,
        "ncr": ncr.code if ncr else None,
        **docs,
    }
    emit("qc.disposed", result)
    return result
