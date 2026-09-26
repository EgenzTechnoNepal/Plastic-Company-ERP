"""Dispatch note posting — uses issue_reserved_stock only."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.services.numbering import generate_document_number
from apps.inventory.reserved_issue import issue_reserved_stock
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.sales.commercial import (
    DispatchNote,
    DispatchNoteLine,
    DispatchNoteStatus,
    SalesOrder,
    SalesOrderLine,
    SalesOrderStatus,
)


class DispatchError(ERPError):
    default_code = "DISPATCH_ERROR"


@transaction.atomic
def create_dispatch_note(*, sales_order: SalesOrder, user=None, warehouse=None, notes: str = "") -> DispatchNote:
    so = SalesOrder.objects.select_for_update().get(pk=sales_order.pk)
    assert_company_allowed(user, so.company_id)
    if so.status in {SalesOrderStatus.DRAFT, SalesOrderStatus.CANCELLED}:
        raise DispatchError("Sales order must be confirmed before dispatch.")
    wh = warehouse or so.warehouse
    if wh is not None:
        assert_related_same_company(so.company_id, "warehouse", wh)
    number = generate_document_number("DN")
    return DispatchNote.objects.create(
        company=so.company,
        document_number=number,
        sales_order=so,
        warehouse=wh,
        notes=notes,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def add_dispatch_line(
    *, dispatch: DispatchNote, sales_order_line: SalesOrderLine, quantity, user=None
) -> DispatchNoteLine:
    dn = DispatchNote.objects.select_for_update().get(pk=dispatch.pk)
    assert_company_allowed(user, dn.company_id)
    if dn.status != DispatchNoteStatus.DRAFT:
        raise DispatchError("Cannot add lines to posted dispatch.")
    if sales_order_line.sales_order_id != dn.sales_order_id:
        raise DispatchError("Dispatch line SO mismatch.")
    qty = _as_decimal(quantity)
    remaining_ordered = _as_decimal(sales_order_line.ordered_quantity) - _as_decimal(
        sales_order_line.dispatched_quantity
    )
    if qty > remaining_ordered:
        raise DispatchError("Dispatch quantity exceeds remaining ordered quantity.")
    return DispatchNoteLine.objects.create(
        dispatch=dn,
        sales_order_line=sales_order_line,
        quantity=qty,
        uom=sales_order_line.uom,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def post_dispatch(*, dispatch: DispatchNote, user=None) -> DispatchNote:
    dn = (
        DispatchNote.objects.select_for_update()
        .select_related("sales_order", "company")
        .prefetch_related("lines__sales_order_line")
        .get(pk=dispatch.pk)
    )
    assert_company_allowed(user, dn.company_id)
    if dn.status == DispatchNoteStatus.POSTED:
        raise DispatchError("Dispatch already posted.", code="DUPLICATE_POST")
    lines = list(dn.lines.all())
    if not lines:
        raise DispatchError("Dispatch has no lines.")

    for dline in lines:
        so_line = SalesOrderLine.objects.select_for_update().get(pk=dline.sales_order_line_id)
        issue_reserved_stock(
            company=dn.company,
            sales_order_line_id=so_line.id,
            quantity=dline.quantity,
            uom=dline.uom,
            user=user,
            reference_type="DISPATCH",
            reference_id=dn.id,
            reason=f"Dispatch {dn.document_number}",
        )
        so_line.dispatched_quantity = _as_decimal(so_line.dispatched_quantity) + _as_decimal(
            dline.quantity
        )
        so_line.reserved_quantity = max(
            Decimal("0"),
            _as_decimal(so_line.reserved_quantity) - _as_decimal(dline.quantity),
        )
        so_line.save(update_fields=["dispatched_quantity", "reserved_quantity", "updated_at"])

    so = SalesOrder.objects.select_for_update().prefetch_related("lines").get(pk=dn.sales_order_id)
    all_dispatched = all(
        _as_decimal(l.dispatched_quantity) >= _as_decimal(l.ordered_quantity) for l in so.lines.all()
    )
    any_dispatched = any(_as_decimal(l.dispatched_quantity) > 0 for l in so.lines.all())
    if all_dispatched:
        so.status = SalesOrderStatus.DISPATCHED
    elif any_dispatched:
        so.status = SalesOrderStatus.PARTIALLY_DISPATCHED
    so.save(update_fields=["status", "updated_at"])

    dn.status = DispatchNoteStatus.POSTED
    dn.posted_at = timezone.now()
    dn.updated_by = user
    dn.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit("DispatchPosted", {"dispatch_id": str(dn.id), "so_id": str(so.id)})
    return dn
