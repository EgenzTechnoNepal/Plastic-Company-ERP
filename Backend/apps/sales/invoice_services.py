"""Sales invoice — commercial only; no stock, no GL."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import ALLOW_INVOICE_BEFORE_DISPATCH
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import UomConversionError, _as_decimal, convert_quantity
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.sales.commercial import (
    DispatchNote,
    DispatchNoteStatus,
    SalesInvoice,
    SalesInvoiceLine,
    SalesInvoiceStatus,
    SalesOrder,
    SalesOrderLine,
    SalesOrderStatus,
)


class SalesInvoiceError(ERPError):
    default_code = "SALES_INVOICE_ERROR"


def _assert_invoice_header_integrity(
    *, company, customer, sales_order=None, dispatch_note=None
) -> None:
    assert_related_same_company(company.id, "customer", customer)
    if customer.company_id != company.id:
        raise SalesInvoiceError(
            "Customer belongs to another company.",
            code="CROSS_COMPANY_CUSTOMER",
        )

    if sales_order is not None:
        assert_related_same_company(company.id, "sales_order", sales_order)
        if sales_order.company_id != company.id:
            raise SalesInvoiceError(
                "Sales order belongs to another company.",
                code="CROSS_COMPANY_SO",
            )
        if sales_order.customer_id != customer.id:
            raise SalesInvoiceError(
                "Invoice customer does not match sales order customer.",
                code="CUSTOMER_MISMATCH",
            )

    if dispatch_note is not None:
        assert_related_same_company(company.id, "dispatch_note", dispatch_note)
        dn = DispatchNote.objects.select_related("sales_order").get(pk=dispatch_note.pk)
        if dn.company_id != company.id:
            raise SalesInvoiceError(
                "Dispatch belongs to another company.",
                code="CROSS_COMPANY_DISPATCH",
            )
        if dn.status != DispatchNoteStatus.POSTED and not ALLOW_INVOICE_BEFORE_DISPATCH:
            raise SalesInvoiceError("Dispatch must be posted before invoice.")
        if sales_order is not None and dn.sales_order_id != sales_order.id:
            raise SalesInvoiceError(
                "Dispatch does not belong to the invoice sales order.",
                code="DISPATCH_SO_MISMATCH",
            )
        if sales_order is None and dn.sales_order_id:
            # Align customer with dispatch SO when SO not explicitly passed
            if dn.sales_order.customer_id != customer.id:
                raise SalesInvoiceError(
                    "Invoice customer does not match dispatch sales order customer.",
                    code="CUSTOMER_MISMATCH",
                )
    elif not ALLOW_INVOICE_BEFORE_DISPATCH:
        raise SalesInvoiceError(
            "Dispatch note is required (invoice-before-dispatch disabled).",
            code="DISPATCH_REQUIRED",
        )


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
    _assert_invoice_header_integrity(
        company=company,
        customer=customer,
        sales_order=sales_order,
        dispatch_note=dispatch_note,
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
    inv = (
        SalesInvoice.objects.select_for_update(of=("self",))
        .select_related("sales_order", "company")
        .get(pk=invoice.pk)
    )
    assert_company_allowed(user, inv.company_id)
    if inv.status != SalesInvoiceStatus.DRAFT:
        raise SalesInvoiceError("Lines only on DRAFT invoices.")

    qty = _as_decimal(quantity)
    if qty <= 0:
        raise SalesInvoiceError("Invoice quantity must be positive.", code="INVALID_QUANTITY")

    so_line: SalesOrderLine | None = fields.get("sales_order_line")
    if so_line is not None:
        so_line = SalesOrderLine.objects.select_related("sales_order", "item", "uom").get(pk=so_line.pk)
        if inv.sales_order_id and so_line.sales_order_id != inv.sales_order_id:
            raise SalesInvoiceError(
                "Sales order line does not belong to invoice sales order.",
                code="SO_LINE_MISMATCH",
            )
        if so_line.sales_order.company_id != inv.company_id:
            raise SalesInvoiceError(
                "Sales order line belongs to another company.",
                code="CROSS_COMPANY_SO_LINE",
            )
        if item.id != so_line.item_id:
            raise SalesInvoiceError(
                "Invoice line item does not match sales order line item.",
                code="ITEM_MISMATCH",
            )
        if uom.id != so_line.uom_id:
            try:
                convert_quantity(Decimal("1"), uom, so_line.uom)
            except UomConversionError as exc:
                raise SalesInvoiceError(
                    "Invoice line UOM is not compatible with sales order line UOM.",
                    code="UOM_INCOMPATIBLE",
                ) from exc
        remaining = (
            _as_decimal(so_line.ordered_quantity)
            - _as_decimal(so_line.invoiced_quantity)
            - _as_decimal(getattr(so_line, "cancelled_quantity", 0) or 0)
        )
        if qty > remaining:
            raise SalesInvoiceError(
                "Invoice quantity exceeds remaining invoicable quantity.",
                code="OVER_INVOICE",
                fields={"remaining": str(remaining)},
            )
        fields = {**fields, "sales_order_line": so_line}

    assert_related_same_company(inv.company_id, "item", item)

    if inv.commercials_frozen:
        raise SalesInvoiceError("Cannot add lines to frozen invoice.", code="INVOICE_FROZEN")

    last = inv.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    line = SalesInvoiceLine.objects.create(
        invoice=inv,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        quantity=qty,
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
    """Commercial post only — never creates stock ledger or GL entries."""
    inv = (
        SalesInvoice.objects.select_for_update(of=("self",))
        .select_related("dispatch_note", "sales_order", "customer", "company")
        .prefetch_related("lines__sales_order_line")
        .get(pk=invoice.pk)
    )
    assert_company_allowed(user, inv.company_id)
    if inv.status == SalesInvoiceStatus.POSTED:
        raise SalesInvoiceError("Invoice already posted.", code="DUPLICATE_POST")

    _assert_invoice_header_integrity(
        company=inv.company,
        customer=inv.customer,
        sales_order=inv.sales_order,
        dispatch_note=inv.dispatch_note,
    )
    if not inv.lines.exists():
        raise SalesInvoiceError("Invoice has no lines.")

    for line in inv.lines.select_related("sales_order_line", "item", "uom").all():
        if line.sales_order_line_id:
            sol = SalesOrderLine.objects.select_for_update().get(pk=line.sales_order_line_id)
            if inv.sales_order_id and sol.sales_order_id != inv.sales_order_id:
                raise SalesInvoiceError(
                    "Sales order line does not belong to invoice sales order.",
                    code="SO_LINE_MISMATCH",
                )
            if line.item_id != sol.item_id:
                raise SalesInvoiceError(
                    "Invoice line item does not match sales order line item.",
                    code="ITEM_MISMATCH",
                )
            remaining = (
                _as_decimal(sol.ordered_quantity)
                - _as_decimal(sol.invoiced_quantity)
                - _as_decimal(getattr(sol, "cancelled_quantity", 0) or 0)
            )
            if _as_decimal(line.quantity) > remaining:
                raise SalesInvoiceError(
                    "Invoice quantity exceeds remaining invoicable quantity.",
                    code="OVER_INVOICE",
                )
            sol.invoiced_quantity = _as_decimal(sol.invoiced_quantity) + _as_decimal(line.quantity)
            sol.save(update_fields=["invoiced_quantity", "updated_at"])

    if inv.sales_order_id:
        so = SalesOrder.objects.select_for_update().prefetch_related("lines").get(pk=inv.sales_order_id)
        all_inv = all(
            _as_decimal(l.invoiced_quantity)
            >= (
                _as_decimal(l.ordered_quantity)
                - _as_decimal(getattr(l, "cancelled_quantity", 0) or 0)
            )
            for l in so.lines.all()
        )
        any_inv = any(_as_decimal(l.invoiced_quantity) > 0 for l in so.lines.all())
        if all_inv:
            so.status = SalesOrderStatus.INVOICED
        elif any_inv:
            so.status = SalesOrderStatus.PARTIALLY_INVOICED
        so.save(update_fields=["status", "updated_at"])

    inv.status = SalesInvoiceStatus.POSTED
    inv.posted_at = timezone.now()
    inv.commercials_frozen = True
    inv.updated_by = user
    inv.save(
        update_fields=[
            "status",
            "posted_at",
            "commercials_frozen",
            "exchange_rate",
            "subtotal",
            "tax_total",
            "total",
            "updated_by",
            "updated_at",
        ]
    )
    emit("SalesInvoicePosted", {"invoice_id": str(inv.id)})
    return inv


@transaction.atomic
def cancel_sales_invoice(*, invoice: SalesInvoice, user=None) -> SalesInvoice:
    """DRAFT only. POSTED invoices are immutable (credit note later)."""
    inv = SalesInvoice.objects.select_for_update().get(pk=invoice.pk)
    assert_company_allowed(user, inv.company_id)
    if inv.status != SalesInvoiceStatus.DRAFT:
        raise SalesInvoiceError(
            "Only DRAFT invoices can be cancelled.",
            code="INVALID_STATUS",
            fields={"status": inv.status},
        )
    inv.status = SalesInvoiceStatus.CANCELLED
    inv.updated_by = user
    inv.save(update_fields=["status", "updated_by", "updated_at"])
    return inv
