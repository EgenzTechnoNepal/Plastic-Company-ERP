"""
Immutable stock ledger writer + balance/FIFO/reservation services.

INVARIANT: every physical quantity mutation (remaining_quantity on lot/layer,
warehouse/bin on layers) MUST go through these domain services and MUST write
the corresponding StockLedgerEntry in the same transaction.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.events import RESERVATION_RELEASED, STOCK_RESERVED, emit
from apps.core.exceptions import ERPError, InsufficientStockError
from apps.inventory.models import InventoryLot, InventoryReceiptLayer, Item, LotStatus, UnitOfMeasure
from apps.inventory.ledger import (
    PHYSICAL_TXN_TYPES,
    STATE_EVENT_TXN_TYPES,
    ReservationStatus,
    StockLedgerEntry,
    StockReservation,
    StockReservationAllocation,
    StockTxnType,
)
from apps.inventory.services import MONEY_QUANT, _as_decimal
from apps.organization.company_scope import (
    CompanyAccessDenied,
    assert_company_allowed,
    company_pk,
)


class LedgerError(ERPError):
    default_code = "LEDGER_ERROR"


class ReservationError(ERPError):
    default_code = "RESERVATION_ERROR"


def assert_objects_same_company(company, **named_objects) -> None:
    """Reject cross-company object graphs even when called outside the REST layer."""
    cid = company_pk(company)
    for name, obj in named_objects.items():
        if obj is None:
            continue
        other = getattr(obj, "company_id", None)
        if other is None and hasattr(obj, "warehouse_id") and obj.warehouse_id:
            # Bin → Warehouse.company
            wh = getattr(obj, "warehouse", None)
            if wh is not None:
                other = getattr(wh, "company_id", None)
        if other is None and hasattr(obj, "lot_id") and obj.lot_id:
            other = getattr(obj.lot, "company_id", None)
        if other is not None and company_pk(other) != cid:
            raise CompanyAccessDenied(
                f"{name} belongs to a different company.",
                code="CROSS_COMPANY_REFERENCE",
                fields={name: str(getattr(obj, "pk", obj))},
            )


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
    is_state_event: bool | None = None,
) -> StockLedgerEntry:
    qty_in = _as_decimal(quantity_in)
    qty_out = _as_decimal(quantity_out)
    cost = _as_decimal(unit_cost)
    moved = qty_in if qty_in > 0 else qty_out
    total = (moved * cost).quantize(MONEY_QUANT)
    if is_state_event is None:
        is_state_event = txn_type in STATE_EVENT_TXN_TYPES
    if is_state_event and (qty_in != 0 or qty_out != 0):
        raise LedgerError("State-event ledger rows must have zero quantity.")
    if not is_state_event and qty_in == 0 and qty_out == 0 and txn_type in PHYSICAL_TXN_TYPES:
        raise LedgerError("Physical ledger rows require a non-zero quantity.")

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
        is_state_event=is_state_event,
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


def models_Q_expiry_ok(today):
    from django.db.models import Q

    return Q(lot__expiry_date__isnull=True) | Q(lot__expiry_date__gte=today)


def eligible_layers_qs(company, item, *, warehouse=None, bin=None):
    qs = InventoryReceiptLayer.objects.select_related("lot", "item").filter(
        company=company,
        item=item,
        is_active=True,
        lot__status=LotStatus.AVAILABLE,
        remaining_quantity__gt=0,
    )
    if warehouse is not None:
        qs = qs.filter(warehouse=warehouse)
    if bin is not None:
        qs = qs.filter(bin=bin)
    today = timezone.now().date()
    qs = qs.filter(models_Q_expiry_ok(today))
    return qs.order_by("fifo_rank", "receipt_sequence", "received_at", "id")


def next_receipt_sequence(company, item) -> int:
    last = (
        InventoryReceiptLayer.objects.filter(company=company, item=item)
        .order_by("-receipt_sequence")
        .values_list("receipt_sequence", flat=True)
        .first()
    )
    return int(last or 0) + 1


def sync_lot_remaining_from_layers(lot: InventoryLot) -> InventoryLot:
    total = (
        InventoryReceiptLayer.objects.filter(lot=lot, is_active=True).aggregate(t=Sum("remaining_quantity"))[
            "t"
        ]
        or Decimal("0")
    )
    lot.remaining_quantity = _as_decimal(total)
    updates = ["remaining_quantity", "updated_at"]
    if lot.remaining_quantity <= 0 and lot.status == LotStatus.AVAILABLE:
        lot.remaining_quantity = Decimal("0")
        lot.status = LotStatus.CONSUMED
        updates.append("status")
    # Reflect primary location from remaining layers (source if any remain)
    layers = list(
        InventoryReceiptLayer.objects.filter(lot=lot, is_active=True, remaining_quantity__gt=0).order_by(
            "fifo_rank", "id"
        )
    )
    if len(layers) == 1:
        lot.warehouse = layers[0].warehouse
        lot.bin = layers[0].bin
        updates.extend(["warehouse", "bin"])
    lot.save(update_fields=list(dict.fromkeys(updates)))
    return lot


@transaction.atomic
def split_layer_quantity(
    *,
    layer: InventoryReceiptLayer,
    quantity,
    to_warehouse,
    to_bin,
    user=None,
    reference_type: str,
    reference_id,
    out_txn_type: str,
    in_txn_type: str,
    reason: str = "",
) -> InventoryReceiptLayer:
    """
    Move `quantity` from `layer` to a new layer at destination location.
    Preserves cost, fifo_rank, lot, and writes OUT+IN ledger lines.
    """
    layer = InventoryReceiptLayer.objects.select_for_update().select_related("lot", "item").get(pk=layer.pk)
    qty = _as_decimal(quantity)
    free = _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)
    if qty <= 0:
        raise LedgerError("Split quantity must be positive.")
    if qty > free:
        raise LedgerError("Insufficient free quantity on layer for split/move.")

    assert_objects_same_company(layer.company, layer=layer, to_warehouse=to_warehouse, to_bin=to_bin)

    unit = layer_unit_cost(layer)
    lot = layer.lot

    # OUT from source
    append_ledger_entry(
        company=layer.company,
        item=layer.item,
        lot=lot,
        receipt_layer=layer,
        warehouse=layer.warehouse,
        bin=layer.bin,
        txn_type=out_txn_type,
        quantity_out=qty,
        uom=layer.uom,
        unit_cost=unit,
        reference_type=reference_type,
        reference_id=reference_id,
        user=user,
        reason=reason or "Location move out",
    )

    layer.remaining_quantity = _as_decimal(layer.remaining_quantity) - qty
    layer.save(update_fields=["remaining_quantity", "updated_at"])

    new_seq = next_receipt_sequence(layer.company, layer.item)
    fifo_rank = layer.fifo_rank or layer.receipt_sequence
    new_layer = InventoryReceiptLayer.objects.create(
        company=layer.company,
        lot=lot,
        item=layer.item,
        warehouse=to_warehouse,
        bin=to_bin,
        received_at=layer.received_at,
        receipt_sequence=new_seq,
        fifo_rank=fifo_rank,
        uom=layer.uom,
        initial_quantity=qty,
        remaining_quantity=qty,
        reserved_quantity=Decimal("0"),
        purchase_unit_cost=layer.purchase_unit_cost,
        landed_unit_cost=layer.landed_unit_cost,
        currency=layer.currency,
        qc_status=layer.qc_status,
        created_by=user,
        updated_by=user,
    )

    append_ledger_entry(
        company=layer.company,
        item=layer.item,
        lot=lot,
        receipt_layer=new_layer,
        warehouse=to_warehouse,
        bin=to_bin,
        txn_type=in_txn_type,
        quantity_in=qty,
        uom=layer.uom,
        unit_cost=unit,
        reference_type=reference_type,
        reference_id=reference_id,
        user=user,
        reason=reason or "Location move in",
    )

    sync_lot_remaining_from_layers(lot)
    return new_layer


def _qty_str(value) -> str:
    return f"{_as_decimal(value):.6f}"


def compute_balances(*, company, item, warehouse=None) -> dict:
    lots = InventoryLot.objects.filter(company=company, item=item, is_active=True)
    if warehouse is not None:
        lots = lots.filter(warehouse=warehouse)

    # Physical from layers (authoritative materialized qty)
    layers = InventoryReceiptLayer.objects.filter(company=company, item=item, is_active=True)
    if warehouse is not None:
        layers = layers.filter(warehouse=warehouse)

    physical = layers.aggregate(t=Sum("remaining_quantity"))["t"] or Decimal("0")
    physical = _as_decimal(physical)

    qc_hold = Decimal("0")
    quarantined = Decimal("0")
    rejected = Decimal("0")
    available = Decimal("0")
    expired = Decimal("0")
    for lot in InventoryLot.objects.filter(company=company, item=item, is_active=True):
        lot_layers = layers.filter(lot=lot) if warehouse is not None else InventoryReceiptLayer.objects.filter(
            lot=lot, is_active=True
        )
        qty = lot_layers.aggregate(t=Sum("remaining_quantity"))["t"] or Decimal("0")
        qty = _as_decimal(qty)
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
    reserved = _as_decimal(reserved_qs.aggregate(t=Sum("reserved_quantity"))["t"] or Decimal("0"))
    atc = available - reserved
    if atc < 0:
        atc = Decimal("0")

    return {
        "company_id": str(company.id),
        "item_id": str(item.id),
        "physical": _qty_str(physical),
        "qc_hold": _qty_str(qc_hold),
        "quarantined": _qty_str(quarantined),
        "rejected": _qty_str(rejected),
        "expired": _qty_str(expired),
        "reserved": _qty_str(reserved),
        "available": _qty_str(available),
        "available_to_consume": _qty_str(atc),
    }


def ledger_derived_layer_qty(layer: InventoryReceiptLayer) -> Decimal:
    """Net physical quantity from ledger for a layer (excludes state events)."""
    qs = StockLedgerEntry.objects.filter(
        receipt_layer=layer, is_state_event=False, txn_type__in=PHYSICAL_TXN_TYPES
    )
    agg = qs.aggregate(inn=Sum("quantity_in"), out=Sum("quantity_out"))
    inn = _as_decimal(agg["inn"] or 0)
    out = _as_decimal(agg["out"] or 0)
    return inn - out


def reconcile_layer(layer: InventoryReceiptLayer) -> dict:
    materialized = _as_decimal(layer.remaining_quantity)
    derived = ledger_derived_layer_qty(layer)
    return {
        "layer_id": str(layer.id),
        "materialized": str(materialized),
        "ledger_derived": str(derived),
        "balanced": materialized == derived,
    }


def reconcile_item(*, company, item) -> dict:
    layers = InventoryReceiptLayer.objects.filter(company=company, item=item, is_active=True)
    details = [reconcile_layer(layer) for layer in layers]
    return {
        "company_id": str(company.id),
        "item_id": str(item.id),
        "all_balanced": all(d["balanced"] for d in details),
        "layers": details,
        "balances": compute_balances(company=company, item=item),
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
    assert_company_allowed(user, company.id)
    assert_objects_same_company(company, item=item, warehouse=warehouse)
    qty = _as_decimal(quantity)
    if qty <= 0:
        raise InsufficientStockError("Issue quantity must be positive.")

    remaining = qty
    entries: list[StockLedgerEntry] = []
    ref_id = reference_id or uuid4()

    layers = list(eligible_layers_qs(company, item, warehouse=warehouse).select_for_update())
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
        sync_lot_remaining_from_layers(layer.lot)

        entry = append_ledger_entry(
            company=company,
            item=item,
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


def _layer_free_qty(layer: InventoryReceiptLayer) -> Decimal:
    return _as_decimal(layer.remaining_quantity) - _as_decimal(layer.reserved_quantity)


def _assert_explicit_layer_eligible(
    *,
    company,
    item: Item,
    lot,
    warehouse,
    layer: InventoryReceiptLayer,
) -> None:
    """Validate explicit receipt_layer against requested item/lot/warehouse and eligibility."""
    assert_objects_same_company(company, item=item, lot=lot, layer=layer, warehouse=warehouse)
    if layer.item_id != item.id:
        raise ReservationError(
            "receipt_layer does not belong to the requested item.",
            code="LAYER_ITEM_MISMATCH",
        )
    if lot is not None and layer.lot_id != lot.id:
        raise ReservationError(
            "receipt_layer does not belong to the requested lot.",
            code="LAYER_LOT_MISMATCH",
        )
    if warehouse is not None and layer.warehouse_id != warehouse.id:
        raise ReservationError(
            "receipt_layer is not in the requested warehouse.",
            code="LAYER_WAREHOUSE_MISMATCH",
        )
    if not layer.is_active:
        raise ReservationError("receipt_layer is inactive.", code="LAYER_INACTIVE")
    if layer.lot.status != LotStatus.AVAILABLE:
        raise ReservationError(
            f"receipt_layer lot status must be AVAILABLE (current={layer.lot.status}).",
            code="LAYER_NOT_AVAILABLE",
        )
    today = timezone.now().date()
    if layer.lot.expiry_date is not None and layer.lot.expiry_date < today:
        raise ReservationError("receipt_layer lot is expired.", code="LAYER_EXPIRED")
    if _as_decimal(layer.remaining_quantity) <= 0:
        raise ReservationError("receipt_layer has no remaining quantity.", code="LAYER_EMPTY")
    if _layer_free_qty(layer) <= 0:
        raise ReservationError("receipt_layer has no free quantity.", code="LAYER_NO_FREE")


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
    """
    Reserve stock against locked eligible layers.

    Critical ordering (concurrency-safe):
      atomic → select_for_update(eligible layers) → recompute free from locked rows
      → allocate → update reserved_quantity → allocations + state-event ledger
    """
    assert_company_allowed(user, company.id)
    assert_objects_same_company(company, item=item, lot=lot, receipt_layer=receipt_layer, warehouse=warehouse)
    qty = _as_decimal(quantity)
    if qty <= 0:
        raise ReservationError("Reservation quantity must be positive.")

    plan: list[tuple[InventoryReceiptLayer, Decimal]] = []

    if receipt_layer is not None:
        # Lock the explicit layer first, then validate & allocate from locked state
        layer = (
            InventoryReceiptLayer.objects.select_for_update()
            .select_related("lot", "item", "warehouse")
            .get(pk=receipt_layer.pk)
        )
        _assert_explicit_layer_eligible(
            company=company, item=item, lot=lot, warehouse=warehouse, layer=layer
        )
        free = _layer_free_qty(layer)
        if qty > free:
            raise ReservationError(
                f"Insufficient free quantity on layer ({free}) for reservation of {qty}.",
                code="INSUFFICIENT_ATC",
            )
        plan.append((layer, qty))
    else:
        # Lock ALL eligible layers before computing available free qty
        layers = list(
            eligible_layers_qs(company, item, warehouse=warehouse)
            .select_for_update()
            .select_related("lot", "item", "warehouse")
        )
        locked_free = sum((_layer_free_qty(lyr) for lyr in layers), Decimal("0"))
        if qty > locked_free:
            raise ReservationError(
                f"Insufficient available-to-consume ({locked_free}) for reservation of {qty}.",
                code="INSUFFICIENT_ATC",
            )
        need = qty
        for lyr in layers:
            if need <= 0:
                break
            free = _layer_free_qty(lyr)
            if free <= 0:
                continue
            take = free if free <= need else need
            plan.append((lyr, take))
            need -= take
        if need > 0:
            raise ReservationError(
                f"Insufficient available-to-consume after lock; short by {need}.",
                code="INSUFFICIENT_ATC",
            )

    first_layer = plan[0][0]
    reservation = StockReservation.objects.create(
        company=company,
        item=item,
        lot=lot or first_layer.lot,
        receipt_layer=first_layer,  # compatibility pointer = first allocation
        warehouse=warehouse or first_layer.warehouse,
        quantity=qty,
        uom=uom,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    for lyr, take in plan:
        lyr.reserved_quantity = _as_decimal(lyr.reserved_quantity) + take
        lyr.save(update_fields=["reserved_quantity", "updated_at"])
        StockReservationAllocation.objects.create(
            reservation=reservation,
            receipt_layer=lyr,
            lot=lyr.lot,
            quantity=take,
            created_by=user,
            updated_by=user,
        )
        append_ledger_entry(
            company=company,
            item=item,
            lot=lyr.lot,
            receipt_layer=lyr,
            warehouse=lyr.warehouse,
            bin=lyr.bin,
            txn_type=StockTxnType.RESERVATION,
            uom=uom,
            reference_type="STOCK_RESERVATION",
            reference_id=reservation.id,
            user=user,
            reason=f"Reservation alloc {take}",
            is_state_event=True,
        )

    emit(STOCK_RESERVED, {"reservation_id": str(reservation.id), "quantity": str(qty)})
    return reservation


@transaction.atomic
def release_reservation(*, reservation: StockReservation, user=None) -> StockReservation:
    assert_company_allowed(user, reservation.company_id)
    reservation = StockReservation.objects.select_for_update().prefetch_related("allocations").get(
        pk=reservation.pk
    )
    if reservation.status != ReservationStatus.OPEN:
        raise ReservationError("Reservation is not open.", code="ALREADY_RELEASED")

    allocations = list(reservation.allocations.select_related("receipt_layer").all())
    if not allocations and reservation.receipt_layer_id:
        # Legacy single-layer reservation
        layer = InventoryReceiptLayer.objects.select_for_update().get(pk=reservation.receipt_layer_id)
        layer.reserved_quantity = max(
            Decimal("0"), _as_decimal(layer.reserved_quantity) - _as_decimal(reservation.quantity)
        )
        layer.save(update_fields=["reserved_quantity", "updated_at"])
        append_ledger_entry(
            company=reservation.company,
            item=reservation.item,
            lot=reservation.lot,
            receipt_layer=layer,
            warehouse=reservation.warehouse,
            txn_type=StockTxnType.RESERVATION_RELEASE,
            uom=reservation.uom,
            reference_type="STOCK_RESERVATION",
            reference_id=reservation.id,
            user=user,
            reason="Reservation released",
            is_state_event=True,
        )
    else:
        for alloc in allocations:
            layer = InventoryReceiptLayer.objects.select_for_update().get(pk=alloc.receipt_layer_id)
            layer.reserved_quantity = max(
                Decimal("0"), _as_decimal(layer.reserved_quantity) - _as_decimal(alloc.quantity)
            )
            layer.save(update_fields=["reserved_quantity", "updated_at"])
            append_ledger_entry(
                company=reservation.company,
                item=reservation.item,
                lot=alloc.lot,
                receipt_layer=layer,
                warehouse=layer.warehouse,
                bin=layer.bin,
                txn_type=StockTxnType.RESERVATION_RELEASE,
                uom=reservation.uom,
                reference_type="STOCK_RESERVATION",
                reference_id=reservation.id,
                user=user,
                reason=f"Release alloc {alloc.quantity}",
                is_state_event=True,
            )

    reservation.status = ReservationStatus.RELEASED
    reservation.updated_by = user
    reservation.save(update_fields=["status", "updated_by", "updated_at"])
    emit(RESERVATION_RELEASED, {"reservation_id": str(reservation.id)})
    return reservation
