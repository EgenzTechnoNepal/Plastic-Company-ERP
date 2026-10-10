"""Gate entry and GRN posting services."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import GRN_POSTED, emit
from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.core.phase3_policy import AUTO_QUARANTINE_BIN_ON_QC_HOLD, PO_RECEIVABLE_STATUSES, REQUIRE_PO_ON_GRN
from apps.core.services.numbering import generate_document_number
from apps.inventory.models import InventoryLot, InventoryReceiptLayer, LotStatus
from apps.inventory.ledger import StockTxnType
from apps.inventory.services import UomConversionError, _as_decimal, convert_quantity
from apps.inventory.stock_services import append_ledger_entry, next_receipt_sequence
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.inbound import (
    GATE_ENTRY_TRANSITIONS,
    GateEntry,
    GateEntryStatus,
    GoodsReceiptLine,
    GoodsReceiptNote,
    GrnStatus,
)
from apps.procurement.lc_services import assert_lc_allows_inbound
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.warehouse.bin_resolver import resolve_qc_hold_bin


class InboundError(ERPError):
    default_code = "INBOUND_ERROR"


def _po_for_gate(gate: GateEntry):
    if gate.purchase_order_id:
        return gate.purchase_order
    shipment = getattr(gate, "shipment", None)
    if shipment is not None and getattr(shipment, "purchase_order_id", None):
        return shipment.purchase_order
    return None


def _po_for_grn(grn: GoodsReceiptNote, lines: list[GoodsReceiptLine] | None = None):
    gate = getattr(grn, "gate_entry", None)
    if gate is not None:
        po = _po_for_gate(gate)
        if po is not None:
            return po
    shipment = getattr(grn, "shipment", None)
    if shipment is not None and getattr(shipment, "purchase_order_id", None):
        return shipment.purchase_order
    for line in lines or []:
        pol = getattr(line, "purchase_order_line", None)
        if pol is not None and getattr(pol, "purchase_order_id", None):
            return pol.purchase_order
    return None


def _transition_gate(gate: GateEntry, new_status: str) -> GateEntry:
    allowed = GATE_ENTRY_TRANSITIONS.get(gate.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"Cannot transition gate entry from {gate.status} to {new_status}.",
            fields={"from": gate.status, "to": new_status},
        )
    gate.status = new_status
    gate.save(update_fields=["status", "updated_at"])
    return gate


def _assert_uom_compatible(grn_uom, po_uom) -> None:
    if grn_uom is None or po_uom is None:
        raise InboundError("UOM is required on GRN and PO lines.", code="UOM_REQUIRED")
    if grn_uom.id == po_uom.id:
        return
    try:
        convert_quantity(Decimal("1"), grn_uom, po_uom)
    except UomConversionError as exc:
        raise InboundError(
            "GRN line UOM is not compatible with PO line UOM.",
            code="UOM_INCOMPATIBLE",
        ) from exc


def _validate_po_line_for_grn(*, grn: GoodsReceiptNote, line: GoodsReceiptLine, accepted: Decimal):
    """
    Full PO linkage integrity BEFORE lot/layer/ledger/progress.
    Returns locked PurchaseOrderLine.
    """
    from apps.core.phase3_policy import over_receipt_allowed
    from apps.procurement.commercial import PurchaseOrder, PurchaseOrderLine

    pol = (
        PurchaseOrderLine.objects.select_for_update()
        .select_related("purchase_order", "purchase_order__supplier", "item", "uom")
        .get(pk=line.purchase_order_line_id)
    )
    po: PurchaseOrder = PurchaseOrder.objects.select_for_update().select_related("supplier").get(
        pk=pol.purchase_order_id
    )

    if po.company_id != grn.company_id:
        raise InboundError(
            "PO company does not match GRN company.",
            code="CROSS_COMPANY_PO",
        )
    if po.supplier_id != grn.supplier_id:
        raise InboundError(
            "PO supplier does not match GRN supplier.",
            code="SUPPLIER_MISMATCH",
        )
    if pol.purchase_order_id != po.id:
        raise InboundError("PO line does not belong to linked PO.", code="PO_LINE_MISMATCH")
    if line.item_id != pol.item_id:
        raise InboundError(
            "GRN line item does not match PO line item.",
            code="ITEM_MISMATCH",
        )
    _assert_uom_compatible(line.uom, pol.uom)

    if po.status not in PO_RECEIVABLE_STATUSES:
        raise InboundError(
            f"PO status {po.status} is not receivable.",
            code="PO_NOT_RECEIVABLE",
            fields={"status": po.status},
        )

    assert_related_same_company(grn.company_id, "purchase_order", po)
    assert_related_same_company(grn.company_id, "purchase_order_line_item", pol.item)

    if not over_receipt_allowed(pol.ordered_quantity, pol.received_quantity, accepted):
        raise InboundError(
            "Over-receipt exceeds configured tolerance.",
            code="OVER_RECEIPT",
        )
    return pol


@transaction.atomic
def submit_gate_entry(*, gate: GateEntry, user=None) -> GateEntry:
    gate = (
        GateEntry.objects.select_for_update()
        .select_related("purchase_order", "shipment", "shipment__purchase_order")
        .get(pk=gate.pk)
    )
    assert_company_allowed(user, gate.company_id)
    assert_lc_allows_inbound(_po_for_gate(gate))
    return _transition_gate(gate, GateEntryStatus.SUBMITTED)


@transaction.atomic
def cancel_gate_entry(*, gate: GateEntry, user=None) -> GateEntry:
    gate = GateEntry.objects.select_for_update().get(pk=gate.pk)
    assert_company_allowed(user, gate.company_id)
    return _transition_gate(gate, GateEntryStatus.CANCELLED)


@transaction.atomic
def post_grn(*, grn: GoodsReceiptNote, user=None) -> GoodsReceiptNote:
    """
    Post GRN: create lots/layers at QC_HOLD (when QC required) + immutable ledger.
    Idempotent: re-post of already POSTED raises.
    Does NOT create AVAILABLE stock when item.qc_required.
    """
    grn = (
        # Related references include nullable FKs; PostgreSQL cannot lock those
        # outer-joined rows, and only the GRN row needs serialization here.
        GoodsReceiptNote.objects.select_for_update(of=("self",))
        .select_related(
            "company",
            "supplier",
            "warehouse",
            "receiving_bin",
            "gate_entry",
            "gate_entry__purchase_order",
            "gate_entry__shipment",
            "gate_entry__shipment__purchase_order",
            "shipment",
            "shipment__purchase_order",
        )
        .prefetch_related("lines__item", "lines__uom", "lines__purchase_order_line")
        .get(pk=grn.pk)
    )
    assert_company_allowed(user, grn.company_id)
    if grn.status == GrnStatus.POSTED:
        raise InboundError("GRN already posted.", code="DUPLICATE_POST")
    if grn.status == GrnStatus.CANCELLED:
        raise InboundError("Cancelled GRN cannot be posted.")
    if not grn.lines.exists():
        raise InboundError("GRN has no lines.")

    assert_related_same_company(grn.company_id, "supplier", grn.supplier)
    assert_related_same_company(grn.company_id, "warehouse", grn.warehouse)
    assert_related_same_company(grn.company_id, "gate_entry", grn.gate_entry)
    assert_related_same_company(grn.company_id, "shipment", grn.shipment)
    if (
        grn.receiving_bin_id
        and grn.receiving_bin.warehouse_id != grn.warehouse_id
    ):
        raise InboundError(
            "Receiving bin must belong to the GRN warehouse.",
            code="BIN_WAREHOUSE_MISMATCH",
            fields={"receiving_bin": str(grn.receiving_bin_id)},
        )

    lines = list(
        grn.lines.select_related("item", "uom", "purchase_order_line", "purchase_order_line__purchase_order").all()
    )
    assert_lc_allows_inbound(_po_for_grn(grn, lines))

    # Pre-validate ALL PO linkages before any stock write
    for line in lines:
        qty = _as_decimal(line.received_quantity)
        if qty <= 0:
            raise InboundError("Received quantity must be positive.")
        accepted = _as_decimal(line.accepted_quantity) or qty
        if accepted <= 0:
            continue
        assert_related_same_company(grn.company_id, "item", line.item)
        if line.purchase_order_line_id:
            _validate_po_line_for_grn(grn=grn, line=line, accepted=accepted)
        elif REQUIRE_PO_ON_GRN:
            raise InboundError("PO line is required on GRN lines.", code="PO_REQUIRED")

    now = timezone.now()
    for line in lines:
        accepted = _as_decimal(line.accepted_quantity) or _as_decimal(line.received_quantity)
        if accepted <= 0:
            continue

        lot_number = line.lot_number or f"{grn.grn_number}-{line.item.sku}"
        initial_status = LotStatus.QC_HOLD if line.item.qc_required else LotStatus.AVAILABLE
        place_bin = grn.receiving_bin
        if line.item.qc_required and AUTO_QUARANTINE_BIN_ON_QC_HOLD:
            place_bin = resolve_qc_hold_bin(warehouse=grn.warehouse, user=user)

        lot = InventoryLot.objects.create(
            company=grn.company,
            lot_number=lot_number,
            item=line.item,
            supplier=grn.supplier,
            supplier_lot_number=line.supplier_lot_number,
            manufacturing_date=line.manufacturing_date,
            expiry_date=line.expiry_date,
            received_date=grn.received_at.date() if grn.received_at else now.date(),
            source_grn=grn,
            source_grn_reference=grn.grn_number,
            purchase_reference=grn.purchase_reference,
            warehouse=grn.warehouse,
            bin=place_bin,
            status=initial_status,
            qc_status="HOLD" if line.item.qc_required else "N/A",
            uom=line.uom,
            initial_quantity=accepted,
            remaining_quantity=accepted,
            currency=grn.currency,
            purchase_unit_cost=_as_decimal(line.purchase_unit_cost),
            landed_unit_cost=None,
            created_by=user,
            updated_by=user,
        )
        seq = next_receipt_sequence(grn.company, line.item)
        layer = InventoryReceiptLayer.objects.create(
            company=grn.company,
            lot=lot,
            item=line.item,
            warehouse=grn.warehouse,
            bin=place_bin,
            received_at=grn.received_at or now,
            receipt_sequence=seq,
            fifo_rank=seq,
            uom=line.uom,
            initial_quantity=accepted,
            remaining_quantity=accepted,
            reserved_quantity=Decimal("0"),
            purchase_unit_cost=_as_decimal(line.purchase_unit_cost),
            landed_unit_cost=None,
            currency=grn.currency,
            qc_status=lot.qc_status,
            created_by=user,
            updated_by=user,
        )
        line.lot = lot
        line.receipt_layer = layer
        line.accepted_quantity = accepted
        line.save(update_fields=["lot", "receipt_layer", "accepted_quantity", "updated_at"])

        unit = _as_decimal(line.purchase_unit_cost)
        append_ledger_entry(
            company=grn.company,
            item=line.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=grn.warehouse,
            bin=place_bin,
            txn_type=StockTxnType.GRN_RECEIPT,
            quantity_in=accepted,
            uom=line.uom,
            unit_cost=unit,
            reference_type="GRN",
            reference_id=grn.id,
            user=user,
            reason=f"GRN {grn.grn_number}",
            occurred_at=grn.received_at or now,
        )

        if line.item.qc_required:
            QCInspection.objects.create(
                company=grn.company,
                inspection_number=generate_document_number("QCI"),
                grn=grn,
                lot=lot,
                item=line.item,
                status=QCInspectionStatus.DRAFT,
                created_by=user,
                updated_by=user,
            )

        if line.purchase_order_line_id:
            from apps.procurement.po_services import apply_po_receipt_progress

            apply_po_receipt_progress(
                purchase_order_line=line.purchase_order_line,
                accepted_qty=accepted,
                user=user,
            )

    if grn.gate_entry_id:
        gate = GateEntry.objects.select_for_update().get(pk=grn.gate_entry_id)
        if gate.status == GateEntryStatus.SUBMITTED:
            _transition_gate(gate, GateEntryStatus.LINKED_TO_GRN)
        elif gate.status == GateEntryStatus.DRAFT:
            _transition_gate(gate, GateEntryStatus.SUBMITTED)
            _transition_gate(gate, GateEntryStatus.LINKED_TO_GRN)

    grn.status = GrnStatus.POSTED
    grn.posted_at = now
    grn.posted_by = user
    grn.updated_by = user
    grn.save(update_fields=["status", "posted_at", "posted_by", "updated_by", "updated_at"])
    emit(GRN_POSTED, {"grn_id": str(grn.id), "grn_number": grn.grn_number})
    return grn
