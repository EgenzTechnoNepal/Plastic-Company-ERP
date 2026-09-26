"""Gate entry and GRN posting services."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import GRN_POSTED, emit
from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.inventory.models import InventoryLot, InventoryReceiptLayer, LotStatus
from apps.inventory.ledger import StockTxnType
from apps.inventory.services import _as_decimal
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


class InboundError(ERPError):
    default_code = "INBOUND_ERROR"


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


@transaction.atomic
def submit_gate_entry(*, gate: GateEntry, user=None) -> GateEntry:
    gate = GateEntry.objects.select_for_update().get(pk=gate.pk)
    assert_company_allowed(user, gate.company_id)
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
        GoodsReceiptNote.objects.select_for_update()
        .select_related("company", "supplier", "warehouse", "receiving_bin")
        .prefetch_related("lines__item", "lines__uom")
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

    now = timezone.now()
    for line in grn.lines.select_related("item", "uom").all():
        qty = _as_decimal(line.received_quantity)
        if qty <= 0:
            raise InboundError("Received quantity must be positive.")
        accepted = _as_decimal(line.accepted_quantity) or qty
        if accepted <= 0:
            continue
        assert_related_same_company(grn.company_id, "item", line.item)

        lot_number = line.lot_number or f"{grn.grn_number}-{line.item.sku}"
        initial_status = LotStatus.QC_HOLD if line.item.qc_required else LotStatus.AVAILABLE

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
            bin=grn.receiving_bin,
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
        # If somehow created as RECEIVED, force to QC_HOLD path — we create directly at QC_HOLD
        seq = next_receipt_sequence(grn.company, line.item)
        layer = InventoryReceiptLayer.objects.create(
            company=grn.company,
            lot=lot,
            item=line.item,
            warehouse=grn.warehouse,
            bin=grn.receiving_bin,
            received_at=grn.received_at or now,
            receipt_sequence=seq,
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
            bin=grn.receiving_bin,
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
