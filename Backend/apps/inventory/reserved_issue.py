"""
Phase 3 reservation-aware stock issue.

CRITICAL: Do NOT modify fifo_issue() for dispatch.
Never release a reservation then run independent FIFO.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import ERPError, InsufficientStockError
from apps.core.phase3_policy import SO_LINE_RESERVATION_REF
from apps.inventory.ledger import ReservationStatus, StockReservation, StockTxnType
from apps.inventory.models import InventoryReceiptLayer, LotStatus
from apps.inventory.services import _as_decimal
from apps.inventory.stock_services import (
    append_ledger_entry,
    assert_objects_same_company,
    layer_unit_cost,
    sync_lot_remaining_from_layers,
)
from apps.organization.company_scope import assert_company_allowed


class ReservedIssueError(ERPError):
    default_code = "RESERVED_ISSUE_ERROR"


def _validate_layer_allocation(
    *,
    reservation: StockReservation,
    layer: InventoryReceiptLayer,
    alloc_qty: Decimal,
    allocation=None,
    today=None,
) -> None:
    """Integrity gate before any stock mutation / ledger write."""
    today = today or timezone.now().date()
    alloc_qty = _as_decimal(alloc_qty)

    if allocation is not None and allocation.reservation_id != reservation.id:
        raise ReservedIssueError(
            "Allocation does not belong to the locked reservation.",
            code="ALLOCATION_RESERVATION_MISMATCH",
        )
    if alloc_qty <= 0:
        raise ReservedIssueError(
            "Allocation quantity must be positive.",
            code="ALLOCATION_QTY_INVALID",
        )

    if reservation.company_id != layer.company_id:
        raise ReservedIssueError(
            "Reservation and layer company mismatch.",
            code="CROSS_COMPANY_LAYER",
        )
    if reservation.item_id != layer.item_id:
        raise ReservedIssueError(
            "Reservation and layer item mismatch.",
            code="ITEM_MISMATCH",
        )
    if layer.lot_id is None:
        raise ReservedIssueError("Layer has no lot.", code="LAYER_NO_LOT")
    if layer.lot.item_id != layer.item_id:
        raise ReservedIssueError(
            "Layer lot item does not match layer item.",
            code="LOT_ITEM_MISMATCH",
        )
    if layer.lot.company_id != reservation.company_id:
        raise ReservedIssueError(
            "Layer lot company does not match reservation company.",
            code="CROSS_COMPANY_LOT",
        )

    assert_objects_same_company(
        reservation.company,
        reservation=reservation,
        item=reservation.item,
        layer=layer,
        lot=layer.lot,
        warehouse=layer.warehouse,
        bin=layer.bin,
    )
    if layer.warehouse_id and layer.warehouse.company_id != reservation.company_id:
        raise ReservedIssueError(
            "Layer warehouse company mismatch.",
            code="CROSS_COMPANY_WAREHOUSE",
        )
    if layer.bin_id:
        if layer.bin.warehouse_id != layer.warehouse_id:
            raise ReservedIssueError(
                "Layer bin does not belong to layer warehouse.",
                code="BIN_WAREHOUSE_MISMATCH",
            )

    if not layer.is_active:
        raise ReservedIssueError("Allocated layer is inactive.", code="LAYER_INACTIVE")
    if layer.lot.status != LotStatus.AVAILABLE:
        raise ReservedIssueError(
            f"Layer lot status must be AVAILABLE (current={layer.lot.status}).",
            code="LOT_NOT_AVAILABLE",
        )
    if layer.lot.expiry_date is not None and layer.lot.expiry_date < today:
        raise ReservedIssueError("Allocated layer lot is expired.", code="LOT_EXPIRED")

    reserved_on_layer = _as_decimal(layer.reserved_quantity)
    if alloc_qty > reserved_on_layer:
        raise ReservedIssueError(
            f"Allocation quantity ({alloc_qty}) exceeds layer reserved ({reserved_on_layer}).",
            code="ALLOCATION_EXCEEDS_RESERVED",
        )


def _assert_reservation_allocation_qty_consistent(reservation: StockReservation, allocations) -> None:
    """Reservation.quantity must equal sum of OPEN allocation rows when allocations exist."""
    if not allocations:
        if _as_decimal(reservation.quantity) <= 0:
            raise ReservedIssueError(
                "Reservation quantity must be positive.",
                code="RESERVATION_QTY_CORRUPT",
            )
        return
    total = sum((_as_decimal(a.quantity) for a in allocations), Decimal("0"))
    if total != _as_decimal(reservation.quantity):
        raise ReservedIssueError(
            f"Reservation quantity ({reservation.quantity}) inconsistent with "
            f"allocation total ({total}).",
            code="RESERVATION_ALLOCATION_QTY_MISMATCH",
        )


@transaction.atomic
def issue_reserved_stock(
    *,
    company,
    sales_order_line_id,
    quantity,
    uom,
    user=None,
    reference_type: str = "DISPATCH",
    reference_id=None,
    reason: str = "",
) -> list:
    """
    Issue exact quantity from OPEN reservations for a sales order line,
    consuming StockReservationAllocation layers only.
    """
    assert_company_allowed(user, company.id)
    qty = _as_decimal(quantity)
    if qty <= 0:
        raise ReservedIssueError("Issue quantity must be positive.")

    reservations = list(
        StockReservation.objects.select_for_update()
        .filter(
            company=company,
            reference_type=SO_LINE_RESERVATION_REF,
            reference_id=sales_order_line_id,
            status=ReservationStatus.OPEN,
            is_active=True,
        )
        .order_by("created_at")
    )
    if not reservations:
        raise ReservedIssueError(
            "No open reservation for sales order line.",
            code="NO_RESERVATION",
        )

    today = timezone.now().date()
    # Phase 1: build and validate full consumption plan (no mutations yet)
    plan: list[dict] = []
    remaining_need = qty

    for reservation in reservations:
        if remaining_need <= 0:
            break
        assert_objects_same_company(company, reservation=reservation, item=reservation.item)
        allocations = list(
            reservation.allocations.select_related(
                "receipt_layer",
                "receipt_layer__lot",
                "receipt_layer__warehouse",
                "receipt_layer__bin",
                "lot",
            )
            .select_for_update(of=("self",))
            .order_by("created_at")
        )
        _assert_reservation_allocation_qty_consistent(reservation, allocations)

        if not allocations and reservation.receipt_layer_id:
            # Legacy single-layer pointer — same integrity rules, no bypass
            layer = (
                InventoryReceiptLayer.objects.select_for_update(of=("self",))
                .select_related("lot", "warehouse", "bin", "item")
                .get(pk=reservation.receipt_layer_id)
            )
            slices = [(None, layer, _as_decimal(reservation.quantity))]
        else:
            slices = []
            for a in allocations:
                layer = (
                    InventoryReceiptLayer.objects.select_for_update(of=("self",))
                    .select_related("lot", "warehouse", "bin", "item")
                    .get(pk=a.receipt_layer_id)
                )
                slices.append((a, layer, _as_decimal(a.quantity)))

        for allocation, layer, alloc_qty in slices:
            if remaining_need <= 0:
                break
            _validate_layer_allocation(
                reservation=reservation,
                layer=layer,
                alloc_qty=alloc_qty,
                allocation=allocation,
                today=today,
            )
            take = min(
                remaining_need,
                alloc_qty,
                _as_decimal(layer.reserved_quantity),
                _as_decimal(layer.remaining_quantity),
            )
            if take <= 0:
                raise ReservedIssueError(
                    "Cannot issue from allocation: insufficient reserved/remaining on layer.",
                    code="INSUFFICIENT_LAYER_QTY",
                )
            plan.append(
                {
                    "reservation": reservation,
                    "allocation": allocation,
                    "layer": layer,
                    "take": take,
                }
            )
            remaining_need -= take

    if remaining_need > 0:
        raise InsufficientStockError(
            f"Insufficient reserved stock. Short by {remaining_need}.",
            fields={"shortfall": str(remaining_need)},
        )

    # Phase 2: mutate stock / ledger / allocations
    entries = []
    ref_id = reference_id or uuid4()
    touched_reservations: dict = {}

    for step in plan:
        reservation = step["reservation"]
        allocation = step["allocation"]
        layer = step["layer"]
        take = step["take"]

        # Re-lock and re-validate immediately before write
        layer = (
            InventoryReceiptLayer.objects.select_for_update(of=("self",))
            .select_related("lot", "warehouse", "bin")
            .get(pk=layer.pk)
        )
        _validate_layer_allocation(
            reservation=reservation,
            layer=layer,
            alloc_qty=take,
            allocation=allocation,
            today=today,
        )

        unit = layer_unit_cost(layer)
        layer.remaining_quantity = _as_decimal(layer.remaining_quantity) - take
        layer.reserved_quantity = _as_decimal(layer.reserved_quantity) - take
        layer.save(update_fields=["remaining_quantity", "reserved_quantity", "updated_at"])
        sync_lot_remaining_from_layers(layer.lot)

        entry = append_ledger_entry(
            company=company,
            item=reservation.item,
            lot=layer.lot,
            receipt_layer=layer,
            warehouse=layer.warehouse,
            bin=layer.bin,
            txn_type=StockTxnType.ISSUE,
            quantity_out=take,
            uom=uom,
            unit_cost=unit,
            reference_type=reference_type,
            reference_id=ref_id,
            user=user,
            reason=reason or f"Reserved issue SO line {sales_order_line_id}",
            is_state_event=False,
        )
        entries.append(entry)

        if allocation is not None:
            allocation = type(allocation).objects.select_for_update().get(pk=allocation.pk)
            left = _as_decimal(allocation.quantity) - take
            if left <= 0:
                allocation.delete()
            else:
                allocation.quantity = left
                allocation.save(update_fields=["quantity", "updated_at"])

        touched_reservations[reservation.pk] = reservation

    for reservation in touched_reservations.values():
        reservation = StockReservation.objects.select_for_update().get(pk=reservation.pk)
        still = sum(
            (_as_decimal(a.quantity) for a in reservation.allocations.all()),
            Decimal("0"),
        )
        if still <= 0:
            reservation.status = ReservationStatus.RELEASED
            reservation.updated_by = user
            reservation.save(update_fields=["status", "updated_by", "updated_at"])
        else:
            reservation.quantity = still
            reservation.updated_by = user
            reservation.save(update_fields=["quantity", "updated_by", "updated_at"])

    return entries
