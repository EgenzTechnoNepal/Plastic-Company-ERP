"""Phase 3 Slice A — typed purchase commercial documents (PO, Supplier Bill)."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class PurchaseOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    SENT = "SENT", "Sent"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
    RECEIVED = "RECEIVED", "Received"
    CLOSED = "CLOSED", "Closed"
    CANCELLED = "CANCELLED", "Cancelled"


PO_TRANSITIONS = {
    PurchaseOrderStatus.DRAFT: {PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.CANCELLED},
    PurchaseOrderStatus.SUBMITTED: {
        PurchaseOrderStatus.APPROVED,
        PurchaseOrderStatus.CANCELLED,
    },
    PurchaseOrderStatus.APPROVED: {
        PurchaseOrderStatus.SENT,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.CANCELLED,
    },
    PurchaseOrderStatus.SENT: {
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.CANCELLED,
    },
    PurchaseOrderStatus.PARTIALLY_RECEIVED: {
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.CLOSED,
    },
    PurchaseOrderStatus.RECEIVED: {PurchaseOrderStatus.CLOSED},
    PurchaseOrderStatus.CLOSED: set(),
    PurchaseOrderStatus.CANCELLED: set(),
}


class PurchaseOrder(BaseModel):
    """Commercial commitment — does NOT create inventory."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="purchase_orders_typed"
    )
    document_number = models.CharField(max_length=40)
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="purchase_orders_typed"
    )
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=8, default=Decimal("1"))
    incoterm = models.ForeignKey(
        "procurement.Incoterm",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    named_place = models.CharField(max_length=200, blank=True)
    destination_warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    payment_terms = models.CharField(max_length=100, blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30, choices=PurchaseOrderStatus.choices, default=PurchaseOrderStatus.DRAFT
    )
    notes = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_po_company_number"
            ),
        ]

    def __str__(self):
        return self.document_number


class PurchaseOrderLine(BaseModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="lines"
    )
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    ordered_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    received_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    cancelled_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    unit_price = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    discount_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    tax_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    destination_warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["purchase_order", "line_no"], name="uq_poline_po_lineno"
            ),
            models.CheckConstraint(
                condition=models.Q(ordered_quantity__gt=0), name="ck_poline_qty_positive"
            ),
        ]

    @property
    def open_quantity(self):
        return (
            self.ordered_quantity - self.cancelled_quantity - self.received_quantity
        )


class SupplierBillMatchStatus(models.TextChoices):
    UNMATCHED = "UNMATCHED", "Unmatched"
    MATCHED = "MATCHED", "Matched"
    TOLERANCE_MATCHED = "TOLERANCE_MATCHED", "Tolerance Matched"
    MISMATCHED = "MISMATCHED", "Mismatched"


class SupplierBillStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class SupplierBill(BaseModel):
    """Vendor commercial invoice — no GL posting in Phase 3."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="supplier_bills_typed"
    )
    document_number = models.CharField(max_length=40)
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="supplier_bills_typed"
    )
    supplier_invoice_number = models.CharField(max_length=80)
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="supplier_bills",
    )
    grn = models.ForeignKey(
        "procurement.GoodsReceiptNote",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="supplier_bills",
    )
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    status = models.CharField(
        max_length=20, choices=SupplierBillStatus.choices, default=SupplierBillStatus.DRAFT
    )
    match_status = models.CharField(
        max_length=30,
        choices=SupplierBillMatchStatus.choices,
        default=SupplierBillMatchStatus.UNMATCHED,
    )
    match_exceptions = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    tax_total = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    total = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    notes = models.TextField(blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_supbill_company_number"
            ),
            models.UniqueConstraint(
                fields=["company", "supplier", "supplier_invoice_number"],
                name="uq_supbill_supplier_invoice",
            ),
        ]


class SupplierBillLine(BaseModel):
    bill = models.ForeignKey(SupplierBill, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_price = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    tax_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="bill_lines",
    )
    grn_line = models.ForeignKey(
        "procurement.GoodsReceiptLine",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="bill_lines",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["bill", "line_no"], name="uq_supbillline_bill_lineno"),
        ]
