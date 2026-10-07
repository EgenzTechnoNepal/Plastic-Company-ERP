"""QC inspection services — hard gate before AVAILABLE stock (Phase 3 plant gate)."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.core.events import QC_FAILED, QC_PASSED, emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import (
    AUTO_QUARANTINE_BIN_ON_QC_HOLD,
    QC_FAIL_DEFAULT_DISPOSITION,
    REQUIRE_COA_BEFORE_QC_PASS,
)
from apps.core.services.numbering import generate_document_number
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import InventoryReceiptLayer, LotStatus
from apps.inventory.services import transition_lot_status
from apps.inventory.stock_services import append_ledger_entry
from apps.organization.company_scope import assert_company_allowed
from apps.quality.qc import QCFailDisposition, QCInspection, QCInspectionStatus
from apps.warehouse.bin_resolver import resolve_qc_hold_bin, resolve_quarantine_bin, resolve_rejected_bin


class QCError(ERPError):
    default_code = "QC_ERROR"


def _move_lot_to_bin(*, lot, bin, user=None) -> None:
    lot.bin = bin
    update = ["bin", "updated_at"]
    if user is not None:
        lot.updated_by = user
        update.append("updated_by")
    lot.save(update_fields=update)
    InventoryReceiptLayer.objects.filter(lot=lot).update(bin=bin)


def _coa_present(inspection: QCInspection) -> bool:
    if (inspection.coa_reference or "").strip():
        return True
    if (inspection.coa_attachment_url or "").strip():
        return True
    lot = inspection.lot
    if lot and (lot.certificate_coa_reference or "").strip():
        return True
    return False


def _create_ncr_stub(*, inspection: QCInspection, disposition: str, user=None) -> str:
    """Create DomainRecord NCR under quality.Record; return code."""
    from apps.quality.models import Record

    code = generate_document_number("NCR")
    Record.objects.create(
        entity="ncrs",
        code=code,
        title=f"QC fail — {inspection.item.sku if inspection.item_id else 'lot'}",
        date=timezone.now().date(),
        status="open",
        fields={
            "source": "inspection",
            "inspectionId": str(inspection.id),
            "inspectionNumber": inspection.inspection_number,
            "lotId": str(inspection.lot_id),
            "lotNumber": getattr(inspection.lot, "lot_number", ""),
            "itemId": str(inspection.item_id),
            "disposition": disposition,
            "remarks": inspection.remarks or "",
        },
        created_by=user,
        updated_by=user,
    )
    return code


@transaction.atomic
def pass_inspection(*, inspection: QCInspection, user=None) -> QCInspection:
    inspection = (
        QCInspection.objects.select_for_update(of=("self",))
        .select_related("lot", "item", "lot__warehouse")
        .get(pk=inspection.pk)
    )
    assert_company_allowed(user, inspection.company_id)
    if inspection.status != QCInspectionStatus.DRAFT:
        raise QCError("Inspection already completed.", code="ALREADY_COMPLETED")
    lot = inspection.lot
    if lot.status != LotStatus.QC_HOLD:
        raise QCError(f"Lot must be QC_HOLD to pass (current={lot.status}).")

    if REQUIRE_COA_BEFORE_QC_PASS and getattr(inspection.item, "coa_required", False):
        if not _coa_present(inspection):
            raise QCError(
                "CoA reference or attachment is required before QC Pass for this item.",
                code="COA_REQUIRED",
            )

    if inspection.coa_reference and not lot.certificate_coa_reference:
        lot.certificate_coa_reference = inspection.coa_reference
        lot.save(update_fields=["certificate_coa_reference", "updated_at"])

    transition_lot_status(lot, LotStatus.AVAILABLE, user=user)
    lot.qc_status = "PASSED"
    lot.save(update_fields=["qc_status", "updated_at"])

    append_ledger_entry(
        company=inspection.company,
        item=inspection.item,
        lot=lot,
        warehouse=lot.warehouse,
        bin=lot.bin,
        txn_type=StockTxnType.QC_RELEASE,
        quantity_in=0,
        quantity_out=0,
        uom=lot.uom,
        unit_cost=lot.landed_unit_cost or lot.purchase_unit_cost,
        reference_type="QC_INSPECTION",
        reference_id=inspection.id,
        user=user,
        reason="QC PASS (state event — no physical quantity change)",
        is_state_event=True,
    )

    inspection.status = QCInspectionStatus.PASSED
    inspection.inspected_at = timezone.now()
    inspection.inspected_by = user
    inspection.updated_by = user
    inspection.save(
        update_fields=["status", "inspected_at", "inspected_by", "updated_by", "updated_at"]
    )
    emit(QC_PASSED, {"inspection_id": str(inspection.id), "lot_id": str(lot.id)})
    return inspection


@transaction.atomic
def fail_inspection(
    *,
    inspection: QCInspection,
    disposition: str | None = None,
    user=None,
) -> QCInspection:
    inspection = (
        QCInspection.objects.select_for_update(of=("self",))
        .select_related("lot", "item", "lot__warehouse")
        .get(pk=inspection.pk)
    )
    assert_company_allowed(user, inspection.company_id)
    if inspection.status != QCInspectionStatus.DRAFT:
        raise QCError("Inspection already completed.", code="ALREADY_COMPLETED")
    disposition = disposition or QC_FAIL_DEFAULT_DISPOSITION or QCFailDisposition.QUARANTINED
    if disposition not in {QCFailDisposition.QUARANTINED, QCFailDisposition.REJECTED}:
        raise QCError("Invalid fail disposition.")
    lot = inspection.lot
    if lot.status != LotStatus.QC_HOLD:
        raise QCError(f"Lot must be QC_HOLD to fail (current={lot.status}).")

    target = LotStatus.QUARANTINED if disposition == QCFailDisposition.QUARANTINED else LotStatus.REJECTED
    transition_lot_status(lot, target, user=user)
    lot.qc_status = "FAILED"
    lot.save(update_fields=["qc_status", "updated_at"])

    if AUTO_QUARANTINE_BIN_ON_QC_HOLD and lot.warehouse_id:
        if disposition == QCFailDisposition.REJECTED:
            dest = resolve_rejected_bin(warehouse=lot.warehouse, user=user)
        else:
            dest = resolve_quarantine_bin(warehouse=lot.warehouse, user=user)
        _move_lot_to_bin(lot=lot, bin=dest, user=user)

    append_ledger_entry(
        company=inspection.company,
        item=inspection.item,
        lot=lot,
        warehouse=lot.warehouse,
        bin=lot.bin,
        txn_type=StockTxnType.QC_REJECT,
        uom=lot.uom,
        unit_cost=lot.purchase_unit_cost,
        reference_type="QC_INSPECTION",
        reference_id=inspection.id,
        user=user,
        reason=f"QC FAIL → {target} (state event — no physical quantity change)",
        is_state_event=True,
    )

    ncr_code = _create_ncr_stub(inspection=inspection, disposition=disposition, user=user)

    inspection.status = QCInspectionStatus.FAILED
    inspection.fail_disposition = disposition
    inspection.ncr_reference = ncr_code
    inspection.inspected_at = timezone.now()
    inspection.inspected_by = user
    inspection.updated_by = user
    inspection.save(
        update_fields=[
            "status",
            "fail_disposition",
            "ncr_reference",
            "inspected_at",
            "inspected_by",
            "updated_by",
            "updated_at",
        ]
    )
    emit(
        QC_FAILED,
        {
            "inspection_id": str(inspection.id),
            "lot_id": str(lot.id),
            "disposition": disposition,
            "ncr": ncr_code,
        },
    )
    return inspection


@transaction.atomic
def start_reinspect(*, lot, user=None, remarks: str = "") -> QCInspection:
    """
    Move a QUARANTINED lot back to QC_HOLD (and QC bin) and open a new DRAFT inspection.
    Only Pass on the new inspection can release to AVAILABLE.
    """
    from apps.inventory.models import InventoryLot

    lot = InventoryLot.objects.select_for_update(of=("self",)).select_related("item", "warehouse").get(pk=lot.pk)
    assert_company_allowed(user, lot.company_id)
    if lot.status != LotStatus.QUARANTINED:
        raise QCError(f"Reinspect requires QUARANTINED lot (current={lot.status}).")

    transition_lot_status(lot, LotStatus.QC_HOLD, user=user)
    lot.qc_status = "HOLD"
    lot.save(update_fields=["qc_status", "updated_at"])
    if AUTO_QUARANTINE_BIN_ON_QC_HOLD and lot.warehouse_id:
        hold_bin = resolve_qc_hold_bin(warehouse=lot.warehouse, user=user)
        _move_lot_to_bin(lot=lot, bin=hold_bin, user=user)

    return QCInspection.objects.create(
        company=lot.company,
        inspection_number=generate_document_number("QCI"),
        grn=lot.source_grn,
        lot=lot,
        item=lot.item,
        status=QCInspectionStatus.DRAFT,
        remarks=remarks or "Reinspect after quarantine",
        created_by=user,
        updated_by=user,
    )
