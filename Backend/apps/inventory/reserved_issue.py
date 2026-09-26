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

    remaining_need = qty
    entries = []
    ref_id = reference_id or uuid4()
    today = timezone.now().date()

    for reservation in reservations:
        if remaining_need <= 0:
            break
        assert_objects_same_company(company, reservation=reservation, item=reservation.item)
        allocations = list(
            reservation.allocations.select_related("receipt_layer", "receipt_layer__lot", "lot")
            .select_for_update()
            .order_by("created_at")
        )
        if not allocations and reservation.receipt_layer_id:
            # Legacy single-layer pointer
            layer = InventoryReceiptLayer.objects.select_for_update().select_related("lot").get(
                pk=reservation.receipt_layer_id
            )
            allocations_plan = [(layer, _as_decimal(reservation.quantity))]
        else:
            allocations_plan = [
                (
                    InventoryReceiptLayer.objects.select_for_update()
                    .select_related("lot")
                    .get(pk=a.receipt_layer_id),
                    _as_decimal(a.quantity),
                )
                for a in allocations
            ]

        for layer, alloc_qty in allocations_plan:
            if remaining_need <= 0:
                break
            if not layer.is_active:
                raise ReservedIssueError("Allocated layer is inactive.")
            if layer.lot.status != LotStatus.AVAILABLE:
                raise ReservedIssueError(
                    f"Layer lot status must be AVAILABLE (current={layer.lot.status}).",
                    code="LOT_NOT_AVAILABLE",
                )
            if layer.lot.expiry_date is not None and layer.lot.expiry_date < today:
                raise ReservedIssueError("Allocated layer lot is expired.", code="LOT_EXPIRED")

            reserved_on_layer = _as_decimal(layer.reserved_quantity)
            if reserved_on_layer <= 0:
                continue
            take = min(remaining_need, alloc_qty, reserved_on_layer, _as_decimal(layer.remaining_quantity))
            if take <= 0:
                continue
            if take > reserved_on_layer:
                raise ReservedIssueError("Insufficient reserved quantity on layer.")

            unit = layer_unit_cost(layer)
            layer.remaining_quantity = _as_decimal(layer.remaining_quantity) - take
            layer.reserved_quantity = reserved_on_layer - take
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
            remaining_need -= take

            # Reduce allocation row
            if allocations:
                for alloc in allocations:
                    if alloc.receipt_layer_id == layer.id:
                        left = _as_decimal(alloc.quantity) - take
                        if left <= 0:
                            alloc.delete()
                        else:
                            alloc.quantity = left
                            alloc.save(update_fields=["quantity", "updated_at"])
                        break

        # Refresh reservation from remaining allocations
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

    if remaining_need > 0:
        raise InsufficientStockError(
            f"Insufficient reserved stock. Short by {remaining_need}.",
            fields={"shortfall": str(remaining_need)},
        )
    return entries
