"""Sales invoice — commercial only; no stock, no GL."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import ALLOW_INVOICE_BEFORE_DISPATCH
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.sales.commercial import (
    DispatchNote,
    DispatchNoteStatus,
    SalesInvoice,
    SalesInvoiceLine,
    SalesInvoiceStatus,
    SalesOrder,
    SalesOrderStatus,
)


class SalesInvoiceError(ERPError):
    default_code = "SALES_INVOICE_ERROR"


@transaction.atomic
def create_sales_invoice(
    *,
    company,
    customer,
    user=None,
    sales_order=None,
    dispatch_note=None,
    **fields,
) -> SalesInvoice:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "customer", customer)
    if sales_order is not None:
        assert_related_same_company(company.id, "sales_order", sales_order)
    if dispatch_note is not None:
        assert_related_same_company(company.id, "dispatch_note", dispatch_note)
        # Re-read status from DB — callers may pass a stale in-memory instance
        dn_status = (
            DispatchNote.objects.filter(pk=dispatch_note.pk).values_list("status", flat=True).first()
        )
        if dn_status != DispatchNoteStatus.POSTED and not ALLOW_INVOICE_BEFORE_DISPATCH:
            raise SalesInvoiceError("Dispatch must be posted before invoice.")
    elif not ALLOW_INVOICE_BEFORE_DISPATCH:
        raise SalesInvoiceError(
            "Dispatch note is required (invoice-before-dispatch disabled).",
            code="DISPATCH_REQUIRED",
        )
    number = generate_document_number("INV")
    return SalesInvoice.objects.create(
        company=company,
        document_number=number,
        customer=customer,
        sales_order=sales_order,
        dispatch_note=dispatch_note,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def add_invoice_line(*, invoice: SalesInvoice, item, uom, quantity, unit_price, user=None, **fields):
    inv = SalesInvoice.objects.select_for_update().get(pk=invoice.pk)
    assert_company_allowed(user, inv.company_id)
    if inv.status != SalesInvoiceStatus.DRAFT:
        raise SalesInvoiceError("Lines only on DRAFT invoices.")
    last = inv.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    line = SalesInvoiceLine.objects.create(
        invoice=inv,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        quantity=quantity,
        unit_price=unit_price,
        created_by=user,
        updated_by=user,
        **fields,
    )
    _recompute(inv)
    return line


def _recompute(inv: SalesInvoice) -> None:
    sub = Decimal("0")
    tax = Decimal("0")
    for line in inv.lines.all():
        base = _as_decimal(line.quantity) * _as_decimal(line.unit_price)
        t = base * _as_decimal(line.tax_pct) / Decimal("100")
        sub += base
        tax += t
    inv.subtotal = sub.quantize(Decimal("0.0001"))
    inv.tax_total = tax.quantize(Decimal("0.0001"))
    inv.total = (sub + tax).quantize(Decimal("0.0001"))
    inv.save(update_fields=["subtotal", "tax_total", "total", "updated_at"])


@transaction.atomic
def post_sales_invoice(*, invoice: SalesInvoice, user=None) -> SalesInvoice:
    inv = (
        SalesInvoice.objects.select_for_update()
        .select_related("dispatch_note", "sales_order")
        .prefetch_related("lines")
        .get(pk=invoice.pk)
    )
    assert_company_allowed(user, inv.company_id)
    if inv.status == SalesInvoiceStatus.POSTED:
        raise SalesInvoiceError("Invoice already posted.", code="DUPLICATE_POST")
    if not ALLOW_INVOICE_BEFORE_DISPATCH:
        if inv.dispatch_note_id is None or inv.dispatch_note.status != DispatchNoteStatus.POSTED:
            raise SalesInvoiceError("Posted dispatch required before invoicing.")
    if not inv.lines.exists():
        raise SalesInvoiceError("Invoice has no lines.")

    for line in inv.lines.all():
        if line.sales_order_line_id:
            sol = line.sales_order_line
            sol.invoiced_quantity = _as_decimal(sol.invoiced_quantity) + _as_decimal(line.quantity)
            sol.save(update_fields=["invoiced_quantity", "updated_at"])

    if inv.sales_order_id:
        so = SalesOrder.objects.select_for_update().prefetch_related("lines").get(pk=inv.sales_order_id)
        all_inv = all(
            _as_decimal(l.invoiced_quantity) >= _as_decimal(l.ordered_quantity) for l in so.lines.all()
        )
        any_inv = any(_as_decimal(l.invoiced_quantity) > 0 for l in so.lines.all())
        if all_inv:
            so.status = SalesOrderStatus.INVOICED
        elif any_inv:
            so.status = SalesOrderStatus.PARTIALLY_INVOICED
        so.save(update_fields=["status", "updated_at"])

    inv.status = SalesInvoiceStatus.POSTED
    inv.posted_at = timezone.now()
    inv.updated_by = user
    inv.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    emit("SalesInvoicePosted", {"invoice_id": str(inv.id)})
    return inv
