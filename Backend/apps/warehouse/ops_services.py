"""Putaway, transfer, adjustment, cycle-count posting."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import PUTAWAY_COMPLETED, STOCK_ADJUSTED, STOCK_TRANSFERRED, emit
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import LotStatus
from apps.inventory.services import _as_decimal
from apps.inventory.stock_services import append_ledger_entry, layer_unit_cost
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.warehouse.models import BinType
from apps.warehouse.operations import (
    CycleCountSession,
    OpsDocStatus,
    PutawayOrder,
    StockAdjustment,
    StockTransfer,
)


class WarehouseOpsError(ERPError):
    default_code = "WAREHOUSE_OPS_ERROR"


@transaction.atomic
def post_putaway(*, putaway: PutawayOrder, user=None) -> PutawayOrder:
    putaway = PutawayOrder.objects.select_for_update().select_related("lot", "to_bin", "to_warehouse").get(
        pk=putaway.pk
    )
    assert_company_allowed(user, putaway.company_id)
    if putaway.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Putaway already posted.", code="DUPLICATE_POST")

    lot = putaway.lot
    if lot.status != LotStatus.AVAILABLE:
        raise WarehouseOpsError(
            "Putaway requires lot AVAILABLE (QC must pass first).",
            code="QC_REQUIRED",
        )
    if putaway.to_bin.bin_type in {BinType.QC_HOLD, BinType.QUARANTINE, BinType.REJECTED}:
        raise WarehouseOpsError("Cannot putaway into QC/quarantine/rejected bin as available storage.")

    assert_related_same_company(putaway.company_id, "warehouse", putaway.to_warehouse)
    qty = _as_decimal(putaway.quantity)
    if qty <= 0 or qty > _as_decimal(lot.remaining_quantity):
        raise WarehouseOpsError("Invalid putaway quantity.")

    from_bin = putaway.from_bin or lot.bin
    lot.warehouse = putaway.to_warehouse
    lot.bin = putaway.to_bin
    lot.save(update_fields=["warehouse", "bin", "updated_at"])
    for layer in lot.receipt_layers.select_for_update().all():
        layer.warehouse = putaway.to_warehouse
        layer.bin = putaway.to_bin
        layer.save(update_fields=["warehouse", "bin", "updated_at"])

    unit = lot.landed_unit_cost or lot.purchase_unit_cost
    append_ledger_entry(
        company=putaway.company,
        item=lot.item,
        lot=lot,
        warehouse=putaway.to_warehouse,
        bin=putaway.to_bin,
        txn_type=StockTxnType.PUTAWAY,
        quantity_in=qty,
        quantity_out=Decimal("0"),
        uom=lot.uom,
        unit_cost=unit,
        reference_type="PUTAWAY",
        reference_id=putaway.id,
        user=user,
        reason=f"Putaway from {from_bin_id(from_bin)}",
    )
    putaway.status = OpsDocStatus.POSTED
    putaway.posted_at = timezone.now()
    putaway.updated_by = user
    putaway.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit(PUTAWAY_COMPLETED, {"putaway_id": str(putaway.id), "lot_id": str(lot.id)})
    return putaway


def from_bin_id(bin_obj):
    return str(bin_obj.id) if bin_obj else ""


@transaction.atomic
def post_transfer(*, transfer: StockTransfer, user=None) -> StockTransfer:
    transfer = StockTransfer.objects.select_for_update().select_related("lot", "item").get(pk=transfer.pk)
    assert_company_allowed(user, transfer.company_id)
    if transfer.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Transfer already posted.", code="DUPLICATE_POST")
    lot = transfer.lot
    if lot.status != LotStatus.AVAILABLE:
        raise WarehouseOpsError("Only AVAILABLE lots can be transferred.")
    qty = _as_decimal(transfer.quantity)
    if qty <= 0 or qty > _as_decimal(lot.remaining_quantity):
        raise WarehouseOpsError("Invalid transfer quantity.")

    unit = lot.landed_unit_cost or lot.purchase_unit_cost
    append_ledger_entry(
        company=transfer.company,
        item=transfer.item,
        lot=lot,
        warehouse=transfer.from_warehouse,
        bin=transfer.from_bin,
        txn_type=StockTxnType.TRANSFER_OUT,
        quantity_out=qty,
        uom=transfer.uom,
        unit_cost=unit,
        reference_type="STOCK_TRANSFER",
        reference_id=transfer.id,
        user=user,
        reason="Transfer out",
    )
    lot.warehouse = transfer.to_warehouse
    lot.bin = transfer.to_bin
    lot.save(update_fields=["warehouse", "bin", "updated_at"])
    for layer in lot.receipt_layers.select_for_update().all():
        layer.warehouse = transfer.to_warehouse
        layer.bin = transfer.to_bin
        layer.save(update_fields=["warehouse", "bin", "updated_at"])

    append_ledger_entry(
        company=transfer.company,
        item=transfer.item,
        lot=lot,
        warehouse=transfer.to_warehouse,
        bin=transfer.to_bin,
        txn_type=StockTxnType.TRANSFER_IN,
        quantity_in=qty,
        uom=transfer.uom,
        unit_cost=unit,
        reference_type="STOCK_TRANSFER",
        reference_id=transfer.id,
        user=user,
        reason="Transfer in",
    )
    transfer.status = OpsDocStatus.POSTED
    transfer.posted_at = timezone.now()
    transfer.updated_by = user
    transfer.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit(STOCK_TRANSFERRED, {"transfer_id": str(transfer.id)})
    return transfer


@transaction.atomic
def post_adjustment(*, adjustment: StockAdjustment, user=None) -> StockAdjustment:
    adjustment = StockAdjustment.objects.select_for_update().select_related("item", "lot").get(
        pk=adjustment.pk
    )
    assert_company_allowed(user, adjustment.company_id)
    if adjustment.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Adjustment already posted.", code="DUPLICATE_POST")
    delta = _as_decimal(adjustment.quantity_delta)
    if delta == 0:
        raise WarehouseOpsError("Adjustment quantity cannot be zero.")
    lot = adjustment.lot
    if lot is None:
        raise WarehouseOpsError("Lot is required for Phase 2 adjustments.")
    if lot.status not in {LotStatus.AVAILABLE, LotStatus.QC_HOLD, LotStatus.QUARANTINED}:
        raise WarehouseOpsError("Lot status not adjustable.")

    new_rem = _as_decimal(lot.remaining_quantity) + delta
    if new_rem < 0:
        raise WarehouseOpsError("Adjustment would make remaining quantity negative.")
    lot.remaining_quantity = new_rem
    lot.save(update_fields=["remaining_quantity", "updated_at"])
    # Adjust primary layer remaining
    layer = lot.receipt_layers.order_by("receipt_sequence").first()
    if layer:
        layer.remaining_quantity = max(Decimal("0"), _as_decimal(layer.remaining_quantity) + delta)
        layer.save(update_fields=["remaining_quantity", "updated_at"])

    unit = _as_decimal(adjustment.unit_cost) or (lot.landed_unit_cost or lot.purchase_unit_cost)
    if delta > 0:
        append_ledger_entry(
            company=adjustment.company,
            item=adjustment.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=adjustment.warehouse,
            bin=adjustment.bin,
            txn_type=StockTxnType.ADJUSTMENT_IN,
            quantity_in=delta,
            uom=adjustment.uom,
            unit_cost=unit,
            reference_type="STOCK_ADJUSTMENT",
            reference_id=adjustment.id,
            user=user,
            reason=adjustment.reason,
        )
    else:
        append_ledger_entry(
            company=adjustment.company,
            item=adjustment.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=adjustment.warehouse,
            bin=adjustment.bin,
            txn_type=StockTxnType.ADJUSTMENT_OUT,
            quantity_out=abs(delta),
            uom=adjustment.uom,
            unit_cost=unit,
            reference_type="STOCK_ADJUSTMENT",
            reference_id=adjustment.id,
            user=user,
            reason=adjustment.reason,
        )
    adjustment.status = OpsDocStatus.POSTED
    adjustment.posted_at = timezone.now()
    adjustment.updated_by = user
    adjustment.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit(STOCK_ADJUSTED, {"adjustment_id": str(adjustment.id)})
    return adjustment


@transaction.atomic
def post_cycle_count(*, session: CycleCountSession, user=None) -> CycleCountSession:
    session = (
        CycleCountSession.objects.select_for_update()
        .prefetch_related("lines")
        .get(pk=session.pk)
    )
    assert_company_allowed(user, session.company_id)
    if session.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Cycle count already posted.", code="DUPLICATE_POST")

    for line in session.lines.all():
        variance = _as_decimal(line.counted_quantity) - _as_decimal(line.expected_quantity)
        line.variance = variance
        line.save(update_fields=["variance", "updated_at"])
        if variance == 0 or line.lot_id is None:
            continue
        adj = StockAdjustment.objects.create(
            company=session.company,
            adjustment_number=f"ADJ-{session.session_number}-{line.id.hex[:8]}",
            item=line.item,
            lot=line.lot,
            warehouse=session.warehouse,
            bin=session.bin,
            quantity_delta=variance,
            uom=line.lot.uom,
            unit_cost=line.lot.landed_unit_cost or line.lot.purchase_unit_cost,
            reason=f"Cycle count {session.session_number}",
            reference=session.session_number,
            created_by=user,
            updated_by=user,
        )
        post_adjustment(adjustment=adj, user=user)
        session.adjustment = adj

    session.status = OpsDocStatus.POSTED
    session.posted_at = timezone.now()
    session.updated_by = user
    session.save(update_fields=["status", "posted_at", "updated_by", "updated_at", "adjustment"])
    return session
