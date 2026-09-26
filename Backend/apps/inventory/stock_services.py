"""Immutable stock ledger writer and balance/FIFO/reservation services."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.events import (
    RESERVATION_RELEASED,
    STOCK_RESERVED,
    emit,
)
from apps.core.exceptions import ERPError, InsufficientStockError
from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    LotStatus,
    UnitOfMeasure,
)
from apps.inventory.ledger import (
    ReservationStatus,
    StockLedgerEntry,
    StockReservation,
    StockTxnType,
)
from apps.inventory.services import MONEY_QUANT, UNIT_COST_QUANT, _as_decimal
from apps.organization.company_scope import assert_company_allowed


class LedgerError(ERPError):
    default_code = "LEDGER_ERROR"


class ReservationError(ERPError):
    default_code = "RESERVATION_ERROR"


def append_ledger_entry(
    *,
    company,
    item,
    txn_type: str,
    quantity_in: Decimal = Decimal("0"),
    quantity_out: Decimal = Decimal("0"),
    uom,
    unit_cost: Decimal = Decimal("0"),
    reference_type: str,
    reference_id,
    user=None,
    lot=None,
    receipt_layer=None,
    warehouse=None,
    bin=None,
    reason: str = "",
    occurred_at=None,
    reversal_of=None,
) -> StockLedgerEntry:
    qty_in = _as_decimal(quantity_in)
    qty_out = _as_decimal(quantity_out)
    cost = _as_decimal(unit_cost)
    moved = qty_in if qty_in > 0 else qty_out
    total = (moved * cost).quantize(MONEY_QUANT)
    entry = StockLedgerEntry(
        company=company,
        item=item,
        lot=lot,
        receipt_layer=receipt_layer,
        warehouse=warehouse,
        bin=bin,
        txn_type=txn_type,
        quantity_in=qty_in,
        quantity_out=qty_out,
        uom=uom,
        unit_cost=cost,
        total_cost=total,
        reference_type=reference_type,
        reference_id=reference_id if isinstance(reference_id, UUID) else UUID(str(reference_id)),
        reason=reason,
        occurred_at=occurred_at or timezone.now(),
        reversal_of=reversal_of,
        created_by=user,
        updated_by=user,
    )
    entry.save()
    return entry


def layer_unit_cost(layer: InventoryReceiptLayer) -> Decimal:
    if layer.landed_unit_cost is not None:
        return _as_decimal(layer.landed_unit_cost)
    return _as_decimal(layer.purchase_unit_cost)


def eligible_layers_qs(company, item, *, warehouse=None):
    qs = (
        InventoryReceiptLayer.objects.select_related("lot", "item")
        .filter(
            company=company,
            item=item,
            is_active=True,
            lot__status=LotStatus.AVAILABLE,
            remaining_quantity__gt=0,
        )
        .exclude(lot__status__in=[LotStatus.QC_HOLD, LotStatus.QUARANTINED, LotStatus.REJECTED, LotStatus.EXPIRED])
    )
    if warehouse is not None:
        qs = qs.filter(warehouse=warehouse)
    # Exclude expired by date when set
    today = timezone.now().date()
    qs = qs.filter(models_Q_expiry_ok(today))
    return qs.order_by("receipt_sequence", "received_at", "id")


def models_Q_expiry_ok(today):
    from django.db.models import Q

    return Q(lot__expiry_date__isnull=True) | Q(lot__expiry_date__gte=today)


def next_receipt_sequence(company, item) -> int:
    last = (
        InventoryReceiptLayer.objects.filter(company=company, item=item)
        .order_by("-receipt_sequence")
        .values_list("receipt_sequence", flat=True)
        .first()
    )
    return int(last or 0) + 1


def compute_balances(*, company, item, warehouse=None) -> dict:
    """Derive inventory balances from lots/layers — not a mutable onHand field."""
    lots = InventoryLot.objects.filter(company=company, item=item, is_active=True)
    if warehouse is not None:
        lots = lots.filter(warehouse=warehouse)

    physical = Decimal("0")
    qc_hold = Decimal("0")
    quarantined = Decimal("0")
    rejected = Decimal("0")
    available = Decimal("0")
    expired = Decimal("0")

    for lot in lots:
        qty = _as_decimal(lot.remaining_quantity)
        physical += qty
        if lot.status == LotStatus.QC_HOLD:
            qc_hold += qty
        elif lot.status == LotStatus.QUARANTINED:
            quarantined += qty
        elif lot.status == LotStatus.REJECTED:
            rejected += qty
        elif lot.status == LotStatus.EXPIRED:
            expired += qty
        elif lot.status == LotStatus.AVAILABLE:
            available += qty

    reserved_qs = InventoryReceiptLayer.objects.filter(
        company=company, item=item, is_active=True, lot__status=LotStatus.AVAILABLE
    )
    if warehouse is not None:
        reserved_qs = reserved_qs.filter(warehouse=warehouse)
    reserved = reserved_qs.aggregate(t=Sum("reserved_quantity"))["t"] or Decimal("0")
    reserved = _as_decimal(reserved)
    atc = available - reserved
    if atc < 0:
        atc = Decimal("0")

    return {
        "company_id": str(company.id),
        "item_id": str(item.id),
        "physical": str(physical),
        "qc_hold": str(qc_hold),
        "quarantined": str(quarantined),
        "rejected": str(rejected),
        "expired": str(expired),
        "reserved": str(reserved),
        "available": str(available),
        "available_to_consume": str(atc),
    }


@transaction.atomic
def fifo_issue(
    *,
    company,
    item: Item,
    quantity,
    uom: UnitOfMeasure,
    user=None,
    warehouse=None,
    reference_type: str = "FIFO_ISSUE",
    reference_id=None,
    reason: str = "",
) -> list[StockLedgerEntry]:
    """Consume eligible AVAILABLE layers FIFO with row locks."""
    from uuid import uuid4

    qty = _as_decimal(quantity)
    if qty <= 0:
        raise InsufficientStockError("Issue quantity must be positive.")

    remaining = qty
    entries: list[StockLedgerEntry] = []
    ref_id = reference_id or uuid4()

    layers = list(
        eligible_layers_qs(company, item, warehouse=warehouse).select_for_update()
    )
    for layer in layers:
        if remaining <= 0:
            break
        free = _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)
        if free <= 0:
            continue
        take = free if free <= remaining else remaining
        unit = layer_unit_cost(layer)
        layer.remaining_quantity = _as_decimal(layer.remaining_quantity) - take
        layer.save(update_fields=["remaining_quantity", "updated_at"])

        lot = layer.lot
        lot.remaining_quantity = _as_decimal(lot.remaining_quantity) - take
        updates = ["remaining_quantity", "updated_at"]
        if lot.remaining_quantity <= 0:
            lot.remaining_quantity = Decimal("0")
            lot.status = LotStatus.CONSUMED
            updates.append("status")
        lot.save(update_fields=updates)

        entry = append_ledger_entry(
            company=company,
            item=item,
            lot=lot,
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
            reason=reason,
        )
        entries.append(entry)
        remaining -= take

    if remaining > 0:
        raise InsufficientStockError(
            f"Insufficient eligible stock. Short by {remaining}.",
            fields={"shortfall": str(remaining)},
        )
    return entries


@transaction.atomic
def reserve_stock(
    *,
    company,
    item: Item,
    quantity,
    uom: UnitOfMeasure,
    user=None,
    lot=None,
    receipt_layer=None,
    warehouse=None,
    reference_type: str = "",
    reference_id=None,
    notes: str = "",
) -> StockReservation:
    qty = _as_decimal(quantity)
    if qty <= 0:
        raise ReservationError("Reservation quantity must be positive.")

    balances = compute_balances(company=company, item=item, warehouse=warehouse)
    atc = _as_decimal(balances["available_to_consume"])
    if qty > atc:
        raise ReservationError(
            f"Insufficient available-to-consume ({atc}) for reservation of {qty}.",
            code="INSUFFICIENT_ATC",
        )

    layer = receipt_layer
    if layer is None:
        layers = list(eligible_layers_qs(company, item, warehouse=warehouse).select_for_update())
        need = qty
        # Reserve across layers FIFO for foundation
        first = None
        for lyr in layers:
            free = _as_decimal(lyr.remaining_quantity) - _as_decimal(lyr.reserved_quantity)
            if free <= 0:
                continue
            take = free if free <= need else need
            lyr.reserved_quantity = _as_decimal(lyr.reserved_quantity) + take
            lyr.save(update_fields=["reserved_quantity", "updated_at"])
            if first is None:
                first = lyr
            need -= take
            if need <= 0:
                break
        if need > 0:
            raise ReservationError("Could not allocate reservation to layers.")
        layer = first
        lot = lot or (layer.lot if layer else None)
    else:
        layer = InventoryReceiptLayer.objects.select_for_update().get(pk=layer.pk)
        free = _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)
        if qty > free:
            raise ReservationError("Insufficient free quantity on layer.")
        layer.reserved_quantity = _as_decimal(layer.reserved_quantity) + qty
        layer.save(update_fields=["reserved_quantity", "updated_at"])
        lot = lot or layer.lot

    reservation = StockReservation.objects.create(
        company=company,
        item=item,
        lot=lot,
        receipt_layer=layer,
        warehouse=warehouse or (layer.warehouse if layer else None),
        quantity=qty,
        uom=uom,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    append_ledger_entry(
        company=company,
        item=item,
        lot=lot,
        receipt_layer=layer,
        warehouse=reservation.warehouse,
        txn_type=StockTxnType.RESERVATION,
        quantity_out=Decimal("0"),
        quantity_in=Decimal("0"),
        uom=uom,
        unit_cost=Decimal("0"),
        reference_type="STOCK_RESERVATION",
        reference_id=reservation.id,
        user=user,
        reason="Reservation (non-physical)",
    )
    emit(STOCK_RESERVED, {"reservation_id": str(reservation.id), "quantity": str(qty)})
    return reservation


@transaction.atomic
def release_reservation(*, reservation: StockReservation, user=None) -> StockReservation:
    if reservation.status != ReservationStatus.OPEN:
        raise ReservationError("Reservation is not open.")
    reservation = StockReservation.objects.select_for_update().get(pk=reservation.pk)
    if reservation.receipt_layer_id:
        layer = InventoryReceiptLayer.objects.select_for_update().get(pk=reservation.receipt_layer_id)
        layer.reserved_quantity = max(
            Decimal("0"), _as_decimal(layer.reserved_quantity) - _as_decimal(reservation.quantity)
        )
        layer.save(update_fields=["reserved_quantity", "updated_at"])
    reservation.status = ReservationStatus.RELEASED
    reservation.updated_by = user
    reservation.save(update_fields=["status", "updated_by", "updated_at"])
    append_ledger_entry(
        company=reservation.company,
        item=reservation.item,
        lot=reservation.lot,
        receipt_layer=reservation.receipt_layer,
        warehouse=reservation.warehouse,
        txn_type=StockTxnType.RESERVATION_RELEASE,
        uom=reservation.uom,
        reference_type="STOCK_RESERVATION",
        reference_id=reservation.id,
        user=user,
        reason="Reservation released",
    )
    emit(RESERVATION_RELEASED, {"reservation_id": str(reservation.id)})
    return reservation
