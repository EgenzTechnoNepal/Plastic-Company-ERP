"""Supplier bill + server-side line-level 3-way match — no GL."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.core.phase3_policy import match_class
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.commercial import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierBill,
    SupplierBillLine,
    SupplierBillMatchStatus,
    SupplierBillStatus,
)
from apps.procurement.inbound import GoodsReceiptLine, GoodsReceiptNote, GrnStatus


class SupplierBillError(ERPError):
    default_code = "SUPPLIER_BILL_ERROR"


def _line_amount(qty, price, tax_pct) -> Decimal:
    gross = _as_decimal(qty) * _as_decimal(price)
    return (gross * (Decimal("1") + _as_decimal(tax_pct) / Decimal("100"))).quantize(Decimal("0.0001"))


def _grn_related_to_po(grn: GoodsReceiptNote, po: PurchaseOrder) -> bool:
    """True if GRN is linked to PO via gate, shipment, or any PO line receipt."""
    if grn.gate_entry_id and getattr(grn.gate_entry, "purchase_order_id", None) == po.id:
        return True
    if grn.shipment_id and getattr(grn.shipment, "purchase_order_id", None) == po.id:
        return True
    return GoodsReceiptLine.objects.filter(
        grn=grn, purchase_order_line__purchase_order_id=po.id
    ).exists()


def _assert_bill_header_links(*, company, supplier, purchase_order=None, grn=None, currency=None) -> None:
    """Reject invalid PO/GRN/supplier/company linkage at service level."""
    assert_related_same_company(company.id if hasattr(company, "id") else company, "supplier", supplier)
    company_id = company.id if hasattr(company, "id") else company

    if purchase_order is not None:
        assert_related_same_company(company_id, "purchase_order", purchase_order)
        if purchase_order.supplier_id != supplier.id:
            raise SupplierBillError(
                "PO supplier does not match bill supplier.",
                code="SUPPLIER_MISMATCH",
            )
        if currency is not None and purchase_order.currency_id is not None:
            if currency.id != purchase_order.currency_id:
                raise SupplierBillError(
                    "Bill currency does not match PO currency.",
                    code="CURRENCY_MISMATCH",
                )

    if grn is not None:
        assert_related_same_company(company_id, "grn", grn)
        if grn.supplier_id != supplier.id:
            raise SupplierBillError(
                "GRN supplier does not match bill supplier.",
                code="SUPPLIER_MISMATCH",
            )

    if purchase_order is not None and grn is not None:
        grn = (
            GoodsReceiptNote.objects.select_related("gate_entry", "shipment")
            .prefetch_related("lines")
            .get(pk=grn.pk)
        )
        if not _grn_related_to_po(grn, purchase_order):
            raise SupplierBillError(
                "GRN is not related to the linked purchase order.",
                code="GRN_PO_UNRELATED",
            )


def _assert_bill_line_links(*, bill: SupplierBill, purchase_order_line=None, grn_line=None) -> None:
    if purchase_order_line is not None:
        if bill.purchase_order_id and purchase_order_line.purchase_order_id != bill.purchase_order_id:
            raise SupplierBillError(
                "Bill line PO line does not belong to bill purchase order.",
                code="PO_LINE_MISMATCH",
            )
        assert_related_same_company(bill.company_id, "purchase_order_line_item", purchase_order_line.item)
    if grn_line is not None:
        if bill.grn_id and grn_line.grn_id != bill.grn_id:
            raise SupplierBillError(
                "Bill line GRN line does not belong to bill GRN.",
                code="GRN_LINE_MISMATCH",
            )
        assert_related_same_company(bill.company_id, "grn_line_item", grn_line.item)


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
    currency = fields.get("currency")
    _assert_bill_header_links(
        company=company,
        supplier=supplier,
        purchase_order=purchase_order,
        grn=grn,
        currency=currency,
    )
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
    bill = SupplierBill.objects.select_for_update().select_related(
        "purchase_order", "grn", "supplier", "company"
    ).get(pk=bill.pk)
    assert_company_allowed(user, bill.company_id)
    if bill.status != SupplierBillStatus.DRAFT:
        raise SupplierBillError("Lines only on DRAFT bills.")
    qty = _as_decimal(quantity)
    if qty <= 0:
        raise SupplierBillError("Bill line quantity must be positive.")

    pol = fields.get("purchase_order_line")
    gl = fields.get("grn_line")
    _assert_bill_line_links(bill=bill, purchase_order_line=pol, grn_line=gl)
    assert_related_same_company(bill.company_id, "item", item)

    last = bill.lines.order_by("-line_no").values_list("line_no", flat=True).first() or 0
    line = SupplierBillLine.objects.create(
        bill=bill,
        line_no=int(last) + 1,
        item=item,
        uom=uom,
        quantity=qty,
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
    """
    Authoritative server-side line-level 3-way match (PO + GRN + Bill).
    Status: MATCHED | TOLERANCE_MATCHED | MISMATCHED
    """
    bill = (
        SupplierBill.objects.select_for_update()
        .select_related(
            "purchase_order",
            "purchase_order__supplier",
            "purchase_order__currency",
            "grn",
            "grn__supplier",
            "grn__gate_entry",
            "grn__shipment",
            "supplier",
            "company",
            "currency",
        )
        .prefetch_related(
            "lines__item",
            "lines__purchase_order_line",
            "lines__grn_line",
            "purchase_order__lines",
            "grn__lines",
        )
        .get(pk=bill.pk)
    )
    assert_company_allowed(user, bill.company_id)
    exceptions: list[str] = []
    saw_tolerance = False

    po: PurchaseOrder | None = bill.purchase_order
    grn: GoodsReceiptNote | None = bill.grn

    if po is None:
        exceptions.append("Purchase order not linked")
    if grn is None:
        exceptions.append("GRN not linked")
    elif grn.status != GrnStatus.POSTED:
        exceptions.append("GRN is not posted")

    # Header integrity
    try:
        if po is not None or grn is not None:
            _assert_bill_header_links(
                company=bill.company,
                supplier=bill.supplier,
                purchase_order=po,
                grn=grn,
                currency=bill.currency,
            )
    except SupplierBillError as exc:
        exceptions.append(str(exc.detail if hasattr(exc, "detail") else exc))

    if po is not None and bill.company_id != po.company_id:
        exceptions.append("Bill company != PO company")
    if grn is not None and bill.company_id != grn.company_id:
        exceptions.append("Bill company != GRN company")
    if po is not None and grn is not None and po.company_id != grn.company_id:
        exceptions.append("PO company != GRN company")
    if po is not None and bill.supplier_id != po.supplier_id:
        exceptions.append("Bill supplier != PO supplier")
    if grn is not None and bill.supplier_id != grn.supplier_id:
        exceptions.append("Bill supplier != GRN supplier")
    if (
        po is not None
        and bill.currency_id is not None
        and po.currency_id is not None
        and bill.currency_id != po.currency_id
    ):
        exceptions.append("Bill currency != PO currency")

    lines = list(bill.lines.all())
    if not lines:
        exceptions.append("Bill has no lines")

    for bl in lines:
        label = f"line {bl.line_no}"
        pol: PurchaseOrderLine | None = bl.purchase_order_line
        gl: GoodsReceiptLine | None = bl.grn_line

        if po is not None and pol is None:
            exceptions.append(f"{label}: not linked to PO line")
            continue
        if grn is not None and gl is None:
            exceptions.append(f"{label}: not linked to GRN line")
            continue

        if pol is not None:
            if po is not None and pol.purchase_order_id != po.id:
                exceptions.append(f"{label}: PO line belongs to another PO")
            if bl.item_id != pol.item_id:
                exceptions.append(f"{label}: item != PO line item")
            else:
                for field, bill_val, po_val, base in (
                    ("qty", bl.quantity, pol.ordered_quantity, pol.ordered_quantity),
                    ("unit_price", bl.unit_price, pol.unit_price, pol.unit_price),
                    ("tax_pct", bl.tax_pct, pol.tax_pct, Decimal("100")),
                ):
                    cls = match_class(bill_val, po_val, base=base)
                    if cls == "mismatch":
                        exceptions.append(
                            f"{label}: {field} mismatch bill={bill_val} po={po_val}"
                        )
                    elif cls == "tolerance":
                        saw_tolerance = True

                bill_amt = _line_amount(bl.quantity, bl.unit_price, bl.tax_pct)
                po_amt = _line_amount(
                    pol.ordered_quantity,
                    _as_decimal(pol.unit_price)
                    * (Decimal("1") - _as_decimal(pol.discount_pct) / Decimal("100")),
                    pol.tax_pct,
                )
                # Compare bill line total vs PO line net+tax total
                cls = match_class(bill_amt, po_amt, base=po_amt)
                if cls == "mismatch":
                    exceptions.append(
                        f"{label}: amount mismatch bill={bill_amt} po={po_amt}"
                    )
                elif cls == "tolerance":
                    saw_tolerance = True

        if gl is not None:
            if grn is not None and gl.grn_id != grn.id:
                exceptions.append(f"{label}: GRN line belongs to another GRN")
            if bl.item_id != gl.item_id:
                exceptions.append(f"{label}: item != GRN line item")
            else:
                grn_qty = _as_decimal(gl.accepted_quantity) or _as_decimal(gl.received_quantity)
                cls = match_class(bl.quantity, grn_qty, base=grn_qty)
                if cls == "mismatch":
                    exceptions.append(
                        f"{label}: qty vs GRN mismatch bill={bl.quantity} grn={grn_qty}"
                    )
                elif cls == "tolerance":
                    saw_tolerance = True

    if exceptions:
        bill.match_status = SupplierBillMatchStatus.MISMATCHED
        bill.match_exceptions = "; ".join(exceptions)
        emit(
            "SupplierBillMismatched",
            {"bill_id": str(bill.id), "exceptions": bill.match_exceptions},
        )
    elif saw_tolerance:
        bill.match_status = SupplierBillMatchStatus.TOLERANCE_MATCHED
        bill.match_exceptions = "Within configured tolerance"
        emit("SupplierBillMatched", {"bill_id": str(bill.id), "tolerance": True})
    else:
        bill.match_status = SupplierBillMatchStatus.MATCHED
        bill.match_exceptions = ""
        emit("SupplierBillMatched", {"bill_id": str(bill.id), "tolerance": False})

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
