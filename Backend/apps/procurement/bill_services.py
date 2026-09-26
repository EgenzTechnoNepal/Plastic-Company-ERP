"""Supplier bill + server-side 3-way match — no GL."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import match_within_tolerance
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.commercial import (
    PurchaseOrder,
    SupplierBill,
    SupplierBillLine,
    SupplierBillMatchStatus,
    SupplierBillStatus,
)
from apps.procurement.inbound import GoodsReceiptNote, GrnStatus


class SupplierBillError(ERPError):
    default_code = "SUPPLIER_BILL_ERROR"


def _line_amount(qty, price, tax_pct) -> Decimal:
    gross = _as_decimal(qty) * _as_decimal(price)
    return (gross * (Decimal("1") + _as_decimal(tax_pct) / Decimal("100"))).quantize(Decimal("0.0001"))


@transaction.atomic
def create_supplier_bill(
    *,
    company,
    supplier,
    supplier_invoice_number,
    user=None,
    purchase_order=None,
    grn=None,
    **fields,
) -> SupplierBill:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "supplier", supplier)
    if purchase_order is not None:
        assert_related_same_company(company.id, "purchase_order", purchase_order)
    if grn is not None:
        assert_related_same_company(company.id, "grn", grn)
    if SupplierBill.objects.filter(
        company=company, supplier=supplier, supplier_invoice_number=supplier_invoice_number
    ).exists():
        raise SupplierBillError(
            "Duplicate supplier invoice number for this supplier.",
            code="DUPLICATE_SUPPLIER_INVOICE",
        )
    number = generate_document_number("BILL")
    return SupplierBill.objects.create(
        company=company,
        document_number=number,
        supplier=supplier,
        supplier_invoice_number=supplier_invoice_number,
        purchase_order=purchase_order,
        grn=grn,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def add_bill_line(*, bill: SupplierBill, item, uom, quantity, unit_price, user=None, **fields) -> SupplierBillLine:
    bill = SupplierBill.objects.select_for_update().get(pk=bill.pk)
    assert_company_allowed(user, bill.company_id)
    if bill.status != SupplierBillStatus.DRAFT:
        raise SupplierBillError("Lines only on DRAFT bills.")
    last = bill.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    line = SupplierBillLine.objects.create(
        bill=bill,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        quantity=quantity,
        unit_price=unit_price,
        created_by=user,
        updated_by=user,
        **fields,
    )
    _recompute_totals(bill)
    return line


def _recompute_totals(bill: SupplierBill) -> None:
    sub = Decimal("0")
    tax = Decimal("0")
    for line in bill.lines.all():
        base = _as_decimal(line.quantity) * _as_decimal(line.unit_price)
        t = base * _as_decimal(line.tax_pct) / Decimal("100")
        sub += base
        tax += t
    bill.subtotal = sub.quantize(Decimal("0.0001"))
    bill.tax_total = tax.quantize(Decimal("0.0001"))
    bill.total = (sub + tax).quantize(Decimal("0.0001"))
    bill.save(update_fields=["subtotal", "tax_total", "total", "updated_at"])


@transaction.atomic
def match_supplier_bill(*, bill: SupplierBill, user=None) -> SupplierBill:
    """Authoritative server-side 3-way match (PO + GRN + Bill)."""
    bill = (
        SupplierBill.objects.select_for_update()
        .select_related("purchase_order", "grn", "supplier", "company")
        .prefetch_related("lines")
        .get(pk=bill.pk)
    )
    assert_company_allowed(user, bill.company_id)
    exceptions: list[str] = []

    po: PurchaseOrder | None = bill.purchase_order
    grn: GoodsReceiptNote | None = bill.grn

    if po is None:
        exceptions.append("Purchase order not linked")
    if grn is None:
        exceptions.append("GRN not linked")
    elif grn.status != GrnStatus.POSTED:
        exceptions.append("GRN is not posted")

    bill_qty = bill.lines.aggregate(t=Sum("quantity"))["t"] or Decimal("0")
    bill_qty = _as_decimal(bill_qty)
    bill_amt = _as_decimal(bill.total)

    po_qty = Decimal("0")
    po_amt = Decimal("0")
    if po is not None:
        for pl in po.lines.all():
            po_qty += _as_decimal(pl.ordered_quantity)
            base = _as_decimal(pl.ordered_quantity) * _as_decimal(pl.unit_price)
            base = base * (Decimal("1") - _as_decimal(pl.discount_pct) / Decimal("100"))
            po_amt += base * (Decimal("1") + _as_decimal(pl.tax_pct) / Decimal("100"))

    grn_qty = Decimal("0")
    if grn is not None:
        for gl in grn.lines.all():
            grn_qty += _as_decimal(gl.accepted_quantity) or _as_decimal(gl.received_quantity)

    if po is not None and not match_within_tolerance(bill_qty, po_qty, base=po_qty):
        exceptions.append(f"Qty vs PO: bill {bill_qty} / PO {po_qty}")
    if grn is not None and not match_within_tolerance(bill_qty, grn_qty, base=grn_qty):
        exceptions.append(f"Qty vs GRN: bill {bill_qty} / accepted {grn_qty}")
    if po is not None and not match_within_tolerance(bill_amt, po_amt, base=po_amt):
        exceptions.append(f"Value vs PO outside tolerance: bill {bill_amt} / PO {po_amt}")

    if not exceptions:
        bill.match_status = SupplierBillMatchStatus.MATCHED
        bill.match_exceptions = ""
        emit("SupplierBillMatched", {"bill_id": str(bill.id)})
    else:
        # If only within-tolerance failures already handled; remaining = mismatch
        # Distinguish tolerance: if qty/amt within tol we'd have empty exceptions.
        bill.match_status = SupplierBillMatchStatus.MISMATCHED
        bill.match_exceptions = "; ".join(exceptions)
        emit(
            "SupplierBillMismatched",
            {"bill_id": str(bill.id), "exceptions": bill.match_exceptions},
        )

    bill.updated_by = user
    bill.save(update_fields=["match_status", "match_exceptions", "updated_by", "updated_at"])
    return bill


@transaction.atomic
def post_supplier_bill(*, bill: SupplierBill, user=None) -> SupplierBill:
    bill = SupplierBill.objects.select_for_update().get(pk=bill.pk)
    assert_company_allowed(user, bill.company_id)
    if bill.status == SupplierBillStatus.POSTED:
        raise SupplierBillError("Bill already posted.", code="DUPLICATE_POST")
    if bill.match_status not in {
        SupplierBillMatchStatus.MATCHED,
        SupplierBillMatchStatus.TOLERANCE_MATCHED,
    }:
        # Allow post of mismatched only if already matched — require match first
        if bill.match_status == SupplierBillMatchStatus.UNMATCHED:
            match_supplier_bill(bill=bill, user=user)
            bill.refresh_from_db()
        if bill.match_status == SupplierBillMatchStatus.MISMATCHED:
            raise SupplierBillError(
                "Cannot post mismatched bill.",
                code="MATCH_FAILED",
            )
    bill.status = SupplierBillStatus.POSTED
    bill.posted_at = timezone.now()
    bill.updated_by = user
    bill.save(update_fields=["status", "posted_at", "updated_by", "updated_at"])
    return bill
