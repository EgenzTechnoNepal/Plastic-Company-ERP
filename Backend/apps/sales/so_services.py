"""Sales order services — confirm reserves via Phase 2 reserve_stock."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import (
    ALLOW_PARTIAL_SO_CONFIRM,
    CREDIT_LIMIT_HARD_BLOCK,
    SO_LINE_RESERVATION_REF,
)
from apps.core.services.numbering import generate_document_number
from apps.inventory.ledger import ReservationStatus, StockReservation
from apps.inventory.services import _as_decimal
from apps.inventory.stock_services import ReservationError, release_reservation, reserve_stock
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.sales.commercial import SalesOrder, SalesOrderLine, SalesOrderStatus


class SalesOrderError(ERPError):
    default_code = "SALES_ORDER_ERROR"


@transaction.atomic
def create_sales_order(*, company, customer, user=None, **fields) -> SalesOrder:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "customer", customer)
    wh = fields.get("warehouse")
    if wh is not None:
        assert_related_same_company(company.id, "warehouse", wh)
    number = generate_document_number("SO")
    return SalesOrder.objects.create(
        company=company,
        document_number=number,
        customer=customer,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def add_so_line(*, sales_order: SalesOrder, item, uom, ordered_quantity, user=None, **fields) -> SalesOrderLine:
    so = SalesOrder.objects.select_for_update().get(pk=sales_order.pk)
    assert_company_allowed(user, so.company_id)
    if so.status != SalesOrderStatus.DRAFT:
        raise SalesOrderError("Lines can only be added to DRAFT sales orders.")
    assert_related_same_company(so.company_id, "item", item)
    qty = _as_decimal(ordered_quantity)
    if qty <= 0:
        raise SalesOrderError("Ordered quantity must be positive.")
    last = so.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    return SalesOrderLine.objects.create(
        sales_order=so,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        ordered_quantity=qty,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def confirm_sales_order(*, sales_order: SalesOrder, user=None) -> SalesOrder:
    """
    Confirm SO and reserve full quantity per line (default: reject if any line short).
    Uses Phase 2 reserve_stock — never DomainRecord products.reserved.
    """
    so = (
        SalesOrder.objects.select_for_update()
        .select_related("customer", "company", "warehouse")
        .prefetch_related("lines")
        .get(pk=sales_order.pk)
    )
    assert_company_allowed(user, so.company_id)
    if so.status != SalesOrderStatus.DRAFT:
        raise SalesOrderError("Only DRAFT sales orders can be confirmed.")
    lines = list(so.lines.all())
    if not lines:
        raise SalesOrderError("Sales order has no lines.")

    # Credit warning (optional hard block)
    if so.customer.credit_limit is not None:
        order_value = sum(
            (
                _as_decimal(l.ordered_quantity)
                * _as_decimal(l.unit_price)
                * (Decimal("1") - _as_decimal(l.discount_pct) / Decimal("100"))
                for l in lines
            ),
            Decimal("0"),
        )
        if order_value > _as_decimal(so.customer.credit_limit):
            msg = f"Order value {order_value} exceeds credit limit {so.customer.credit_limit}."
            so.credit_warning = msg
            if CREDIT_LIMIT_HARD_BLOCK:
                raise SalesOrderError(msg, code="CREDIT_LIMIT")

    # Pre-check: try reserve each line; on failure roll back entire confirm unless partial allowed
    created_reservations = []
    try:
        for line in lines:
            wh = line.warehouse or so.warehouse
            try:
                res = reserve_stock(
                    company=so.company,
                    item=line.item,
                    quantity=line.ordered_quantity,
                    uom=line.uom,
                    user=user,
                    warehouse=wh,
                    reference_type=SO_LINE_RESERVATION_REF,
                    reference_id=line.id,
                    notes=f"SO {so.document_number} line {line.line_no}",
                )
            except ReservationError as exc:
                if not ALLOW_PARTIAL_SO_CONFIRM:
                    raise SalesOrderError(
                        f"Insufficient stock to reserve line {line.line_no}: {exc.detail if hasattr(exc, 'detail') else exc}",
                        code="INSUFFICIENT_ATC",
                    ) from exc
                continue
            created_reservations.append((line, res))
            line.reserved_quantity = _as_decimal(res.quantity)
            line.save(update_fields=["reserved_quantity", "updated_at"])
    except SalesOrderError:
        # Release any reservations created in this attempt
        for _line, res in created_reservations:
            if res.status == ReservationStatus.OPEN:
                release_reservation(reservation=res, user=user)
        raise

    if not created_reservations:
        raise SalesOrderError("Could not reserve any lines.", code="INSUFFICIENT_ATC")

    all_reserved = all(
        _as_decimal(l.reserved_quantity) >= _as_decimal(l.ordered_quantity) for l in lines
    )
    so.status = SalesOrderStatus.RESERVED if all_reserved else SalesOrderStatus.PARTIALLY_RESERVED
    so.confirmed_at = timezone.now()
    so.updated_by = user
    so.save(update_fields=["status", "confirmed_at", "credit_warning", "updated_by", "updated_at"])
    emit(
        "SalesOrderConfirmed",
        {"so_id": str(so.id), "document_number": so.document_number, "status": so.status},
    )
    return so


@transaction.atomic
def cancel_sales_order(*, sales_order: SalesOrder, user=None) -> SalesOrder:
    so = SalesOrder.objects.select_for_update().prefetch_related("lines").get(pk=sales_order.pk)
    assert_company_allowed(user, so.company_id)
    if so.status in {SalesOrderStatus.DISPATCHED, SalesOrderStatus.INVOICED, SalesOrderStatus.COMPLETED}:
        raise SalesOrderError("Cannot cancel after dispatch/invoice; use returns flow.")
    if any(_as_decimal(l.dispatched_quantity) > 0 for l in so.lines.all()):
        raise SalesOrderError("Cannot cancel SO with dispatched quantity.")

    for line in so.lines.all():
        for res in StockReservation.objects.filter(
            company=so.company,
            reference_type=SO_LINE_RESERVATION_REF,
            reference_id=line.id,
            status=ReservationStatus.OPEN,
        ):
            release_reservation(reservation=res, user=user)
        line.reserved_quantity = Decimal("0")
        line.save(update_fields=["reserved_quantity", "updated_at"])

    so.status = SalesOrderStatus.CANCELLED
    so.updated_by = user
    so.save(update_fields=["status", "updated_by", "updated_at"])
    emit("SalesOrderCancelled", {"so_id": str(so.id)})
    return so


@transaction.atomic
def release_sales_order_reservations(*, sales_order: SalesOrder, user=None) -> SalesOrder:
    """Release open reservations without cancelling the SO (commercial stay)."""
    so = SalesOrder.objects.select_for_update().prefetch_related("lines").get(pk=sales_order.pk)
    assert_company_allowed(user, so.company_id)
    if any(_as_decimal(l.dispatched_quantity) > 0 for l in so.lines.all()):
        raise SalesOrderError("Cannot release reservations after dispatch.")
    for line in so.lines.all():
        for res in StockReservation.objects.filter(
            company=so.company,
            reference_type=SO_LINE_RESERVATION_REF,
            reference_id=line.id,
            status=ReservationStatus.OPEN,
        ):
            release_reservation(reservation=res, user=user)
        line.reserved_quantity = Decimal("0")
        line.save(update_fields=["reserved_quantity", "updated_at"])
    so.status = SalesOrderStatus.CONFIRMED
    so.updated_by = user
    so.save(update_fields=["status", "updated_by", "updated_at"])
    emit("ReservationReleased", {"so_id": str(so.id), "source": "sales_order_release"})
    return so
