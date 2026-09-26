"""Putaway, transfer, adjustment, cycle-count posting — partial qty safe."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import PUTAWAY_COMPLETED, STOCK_ADJUSTED, STOCK_TRANSFERRED, emit
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockTxnType
from apps.inventory.models import InventoryReceiptLayer, LotStatus
from apps.inventory.services import _as_decimal
from apps.inventory.stock_services import (
    append_ledger_entry,
    assert_objects_same_company,
    layer_unit_cost,
    split_layer_quantity,
    sync_lot_remaining_from_layers,
)
from apps.organization.company_scope import assert_company_allowed
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


def _layers_for_move(lot, *, from_warehouse=None, from_bin=None, qty_needed: Decimal):
    qs = InventoryReceiptLayer.objects.select_for_update().filter(
        lot=lot, is_active=True, remaining_quantity__gt=0
    )
    if from_warehouse is not None:
        qs = qs.filter(warehouse=from_warehouse)
    if from_bin is not None:
        qs = qs.filter(bin=from_bin)
    return list(qs.order_by("fifo_rank", "receipt_sequence", "id"))


@transaction.atomic
def post_putaway(*, putaway: PutawayOrder, user=None) -> PutawayOrder:
    putaway = PutawayOrder.objects.select_for_update().select_related(
        "lot", "to_bin", "to_bin__warehouse", "to_warehouse", "from_bin", "from_bin__warehouse", "company"
    ).get(pk=putaway.pk)
    assert_company_allowed(user, putaway.company_id)
    if putaway.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Putaway already posted.", code="DUPLICATE_POST")

    lot = putaway.lot
    assert_objects_same_company(
        putaway.company,
        lot=lot,
        to_warehouse=putaway.to_warehouse,
        to_bin=putaway.to_bin,
        from_bin=putaway.from_bin,
    )
    if putaway.to_bin.warehouse_id != putaway.to_warehouse_id:
        raise WarehouseOpsError(
            "Destination bin does not belong to destination warehouse.",
            code="DEST_BIN_WAREHOUSE_MISMATCH",
        )
    if lot.status != LotStatus.AVAILABLE:
        raise WarehouseOpsError(
            "Putaway requires lot AVAILABLE (QC must pass first).",
            code="QC_REQUIRED",
        )
    if lot.status in {LotStatus.QC_HOLD, LotStatus.QUARANTINED, LotStatus.REJECTED}:
        raise WarehouseOpsError("Invalid lot status for putaway.")
    if putaway.to_bin.bin_type in {BinType.QC_HOLD, BinType.QUARANTINE, BinType.REJECTED}:
        raise WarehouseOpsError("Cannot putaway into QC/quarantine/rejected bin as available storage.")

    qty = _as_decimal(putaway.quantity)
    if qty <= 0:
        raise WarehouseOpsError("Invalid putaway quantity.")
    if qty > _as_decimal(lot.remaining_quantity):
        raise WarehouseOpsError("Insufficient quantity for putaway.")

    # Explicit from_bin: must match company (via warehouse) and be the actual source of selected layers
    from_bin = putaway.from_bin
    if from_bin is not None:
        layers = _layers_for_move(lot, from_bin=from_bin, qty_needed=qty)
        if not layers:
            raise WarehouseOpsError(
                "No stock layers found at the supplied from_bin.",
                code="SOURCE_BIN_EMPTY",
            )
        for layer in layers:
            if layer.bin_id != from_bin.id:
                raise WarehouseOpsError(
                    "Source layer bin does not match putaway from_bin.",
                    code="SOURCE_BIN_MISMATCH",
                )
    else:
        from_bin = lot.bin
        if from_bin is not None:
            layers = _layers_for_move(lot, from_bin=from_bin, qty_needed=qty)
        else:
            layers = _layers_for_move(lot, qty_needed=qty)

    remaining = qty
    for layer in layers:
        if remaining <= 0:
            break
        free = _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)
        if free <= 0:
            continue
        take = free if free <= remaining else remaining
        # Full layer relocate vs split
        if take == _as_decimal(layer.remaining_quantity) and _as_decimal(layer.reserved_quantity) == 0:
            unit = layer_unit_cost(layer)
            append_ledger_entry(
                company=putaway.company,
                item=lot.item,
                lot=lot,
                receipt_layer=layer,
                warehouse=layer.warehouse,
                bin=layer.bin,
                txn_type=StockTxnType.PUTAWAY_OUT,
                quantity_out=take,
                uom=lot.uom,
                unit_cost=unit,
                reference_type="PUTAWAY",
                reference_id=putaway.id,
                user=user,
                reason="Putaway out",
            )
            layer.warehouse = putaway.to_warehouse
            layer.bin = putaway.to_bin
            layer.save(update_fields=["warehouse", "bin", "updated_at"])
            append_ledger_entry(
                company=putaway.company,
                item=lot.item,
                lot=lot,
                receipt_layer=layer,
                warehouse=putaway.to_warehouse,
                bin=putaway.to_bin,
                txn_type=StockTxnType.PUTAWAY_IN,
                quantity_in=take,
                uom=lot.uom,
                unit_cost=unit,
                reference_type="PUTAWAY",
                reference_id=putaway.id,
                user=user,
                reason="Putaway in",
            )
        else:
            split_layer_quantity(
                layer=layer,
                quantity=take,
                to_warehouse=putaway.to_warehouse,
                to_bin=putaway.to_bin,
                user=user,
                reference_type="PUTAWAY",
                reference_id=putaway.id,
                out_txn_type=StockTxnType.PUTAWAY_OUT,
                in_txn_type=StockTxnType.PUTAWAY_IN,
                reason="Partial putaway",
            )
        remaining -= take

    if remaining > 0:
        raise WarehouseOpsError("Could not allocate putaway quantity from source layers.")

    sync_lot_remaining_from_layers(lot)
    putaway.status = OpsDocStatus.POSTED
    putaway.posted_at = timezone.now()
    putaway.updated_by = user
    putaway.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit(PUTAWAY_COMPLETED, {"putaway_id": str(putaway.id), "lot_id": str(lot.id)})
    return putaway


@transaction.atomic
def post_transfer(*, transfer: StockTransfer, user=None) -> StockTransfer:
    transfer = StockTransfer.objects.select_for_update().select_related(
        "lot",
        "item",
        "company",
        "from_warehouse",
        "from_bin",
        "to_warehouse",
        "to_bin",
        "to_bin__warehouse",
    ).get(pk=transfer.pk)
    assert_company_allowed(user, transfer.company_id)
    if transfer.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Transfer already posted.", code="DUPLICATE_POST")

    lot = transfer.lot
    assert_objects_same_company(
        transfer.company,
        lot=lot,
        item=transfer.item,
        from_warehouse=transfer.from_warehouse,
        to_warehouse=transfer.to_warehouse,
        from_bin=transfer.from_bin,
        to_bin=transfer.to_bin,
    )
    if transfer.to_bin.warehouse_id != transfer.to_warehouse_id:
        raise WarehouseOpsError(
            "Destination bin does not belong to destination warehouse.",
            code="DEST_BIN_WAREHOUSE_MISMATCH",
        )
    if lot.status != LotStatus.AVAILABLE:
        raise WarehouseOpsError("Only AVAILABLE lots can be transferred.", code="INVALID_STATUS")
    if lot.status in {LotStatus.QC_HOLD, LotStatus.QUARANTINED, LotStatus.REJECTED}:
        raise WarehouseOpsError("Invalid lot status for transfer.", code="INVALID_STATUS")

    qty = _as_decimal(transfer.quantity)
    if qty <= 0:
        raise WarehouseOpsError("Invalid transfer quantity.")
    if qty > _as_decimal(lot.remaining_quantity):
        raise WarehouseOpsError("Insufficient quantity for transfer.")

    remaining = qty
    layers = _layers_for_move(
        lot, from_warehouse=transfer.from_warehouse, from_bin=transfer.from_bin, qty_needed=qty
    )
    for layer in layers:
        if remaining <= 0:
            break
        free = _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)
        if free <= 0:
            continue
        take = free if free <= remaining else remaining
        if take == _as_decimal(layer.remaining_quantity) and _as_decimal(layer.reserved_quantity) == 0:
            unit = layer_unit_cost(layer)
            append_ledger_entry(
                company=transfer.company,
                item=transfer.item,
                lot=lot,
                receipt_layer=layer,
                warehouse=transfer.from_warehouse,
                bin=transfer.from_bin,
                txn_type=StockTxnType.TRANSFER_OUT,
                quantity_out=take,
                uom=transfer.uom,
                unit_cost=unit,
                reference_type="STOCK_TRANSFER",
                reference_id=transfer.id,
                user=user,
                reason="Transfer out",
            )
            layer.warehouse = transfer.to_warehouse
            layer.bin = transfer.to_bin
            layer.save(update_fields=["warehouse", "bin", "updated_at"])
            append_ledger_entry(
                company=transfer.company,
                item=transfer.item,
                lot=lot,
                receipt_layer=layer,
                warehouse=transfer.to_warehouse,
                bin=transfer.to_bin,
                txn_type=StockTxnType.TRANSFER_IN,
                quantity_in=take,
                uom=transfer.uom,
                unit_cost=unit,
                reference_type="STOCK_TRANSFER",
                reference_id=transfer.id,
                user=user,
                reason="Transfer in",
            )
        else:
            split_layer_quantity(
                layer=layer,
                quantity=take,
                to_warehouse=transfer.to_warehouse,
                to_bin=transfer.to_bin,
                user=user,
                reference_type="STOCK_TRANSFER",
                reference_id=transfer.id,
                out_txn_type=StockTxnType.TRANSFER_OUT,
                in_txn_type=StockTxnType.TRANSFER_IN,
                reason="Partial transfer",
            )
        remaining -= take

    if remaining > 0:
        raise WarehouseOpsError("Could not allocate transfer quantity from source layers.")

    sync_lot_remaining_from_layers(lot)
    transfer.status = OpsDocStatus.POSTED
    transfer.posted_at = timezone.now()
    transfer.updated_by = user
    transfer.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit(STOCK_TRANSFERRED, {"transfer_id": str(transfer.id)})
    return transfer


@transaction.atomic
def post_adjustment(*, adjustment: StockAdjustment, user=None) -> StockAdjustment:
    adjustment = StockAdjustment.objects.select_for_update().select_related(
        "item", "lot", "receipt_layer", "receipt_layer__warehouse", "receipt_layer__bin", "company",
        "warehouse", "bin",
    ).get(pk=adjustment.pk)
    assert_company_allowed(user, adjustment.company_id)
    if adjustment.status == OpsDocStatus.POSTED:
        raise WarehouseOpsError("Adjustment already posted.", code="DUPLICATE_POST")

    delta = _as_decimal(adjustment.quantity_delta)
    if delta == 0:
        raise WarehouseOpsError("Adjustment quantity cannot be zero.")
    lot = adjustment.lot
    if lot is None:
        raise WarehouseOpsError("Lot is required for Phase 2 adjustments.")
    if adjustment.receipt_layer_id is None:
        raise WarehouseOpsError(
            "receipt_layer is required — multi-layer lots cannot silently adjust the first layer.",
            code="LAYER_REQUIRED",
        )
    layer = InventoryReceiptLayer.objects.select_for_update().select_related(
        "lot", "item", "warehouse", "bin"
    ).get(pk=adjustment.receipt_layer_id)
    if layer.lot_id != lot.id:
        raise WarehouseOpsError(
            "receipt_layer does not belong to the adjustment lot.",
            code="LAYER_LOT_MISMATCH",
        )
    if layer.item_id != adjustment.item_id:
        raise WarehouseOpsError(
            "receipt_layer does not belong to the adjustment item.",
            code="LAYER_ITEM_MISMATCH",
        )
    if adjustment.warehouse_id and layer.warehouse_id != adjustment.warehouse_id:
        raise WarehouseOpsError(
            "receipt_layer warehouse does not match adjustment warehouse.",
            code="LAYER_WAREHOUSE_MISMATCH",
        )
    if adjustment.bin_id and layer.bin_id != adjustment.bin_id:
        raise WarehouseOpsError(
            "receipt_layer bin does not match adjustment bin.",
            code="LAYER_BIN_MISMATCH",
        )
    assert_objects_same_company(
        adjustment.company,
        lot=lot,
        item=adjustment.item,
        layer=layer,
        warehouse=adjustment.warehouse,
        bin=adjustment.bin,
    )

    if lot.status not in {LotStatus.AVAILABLE, LotStatus.QC_HOLD, LotStatus.QUARANTINED}:
        raise WarehouseOpsError("Lot status not adjustable.")

    new_layer_rem = _as_decimal(layer.remaining_quantity) + delta
    if new_layer_rem < 0:
        raise WarehouseOpsError("Adjustment would make layer remaining quantity negative.")
    layer.remaining_quantity = new_layer_rem
    layer.save(update_fields=["remaining_quantity", "updated_at"])
    sync_lot_remaining_from_layers(lot)

    # Ledger location must describe the actual selected layer
    ledger_warehouse = layer.warehouse
    ledger_bin = layer.bin
    unit = _as_decimal(adjustment.unit_cost) or layer_unit_cost(layer)
    if delta > 0:
        append_ledger_entry(
            company=adjustment.company,
            item=adjustment.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=ledger_warehouse,
            bin=ledger_bin,
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
            warehouse=ledger_warehouse,
            bin=ledger_bin,
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
        if line.receipt_layer_id is None:
            raise WarehouseOpsError(
                f"Cycle count line {line.id} requires receipt_layer for multi-layer safety.",
                code="LAYER_REQUIRED",
            )
        adj = StockAdjustment.objects.create(
            company=session.company,
            adjustment_number=f"ADJ-{session.session_number}-{line.id.hex[:8]}",
            item=line.item,
            lot=line.lot,
            receipt_layer=line.receipt_layer,
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
