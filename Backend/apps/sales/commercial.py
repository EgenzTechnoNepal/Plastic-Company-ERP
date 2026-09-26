"""Phase 3 Slice A — typed sales commercial documents."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class SalesOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    CONFIRMED = "CONFIRMED", "Confirmed"
    PARTIALLY_RESERVED = "PARTIALLY_RESERVED", "Partially Reserved"
    RESERVED = "RESERVED", "Reserved"
    PARTIALLY_DISPATCHED = "PARTIALLY_DISPATCHED", "Partially Dispatched"
    DISPATCHED = "DISPATCHED", "Dispatched"
    PARTIALLY_INVOICED = "PARTIALLY_INVOICED", "Partially Invoiced"
    INVOICED = "INVOICED", "Invoiced"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class SalesOrder(BaseModel):
    """Customer commercial order — does NOT create inventory."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="sales_orders_typed"
    )
    document_number = models.CharField(max_length=40)
    customer = models.ForeignKey(
        "crm.Customer", on_delete=models.PROTECT, related_name="sales_orders_typed"
    )
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    requested_delivery_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    customer_reference = models.CharField(max_length=80, blank=True)
    status = models.CharField(
        max_length=30, choices=SalesOrderStatus.choices, default=SalesOrderStatus.DRAFT
    )
    credit_warning = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_so_company_number"
            ),
        ]

    def __str__(self):
        return self.document_number


class SalesOrderLine(BaseModel):
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    ordered_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    reserved_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    dispatched_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    invoiced_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    unit_price = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    discount_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    tax_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["sales_order", "line_no"], name="uq_soline_so_lineno"
            ),
            models.CheckConstraint(
                condition=models.Q(ordered_quantity__gt=0), name="ck_soline_qty_positive"
            ),
        ]


class DispatchNoteStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class DispatchNote(BaseModel):
    """Physical outbound document — posts via issue_reserved_stock only."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="dispatch_notes"
    )
    document_number = models.CharField(max_length=40)
    sales_order = models.ForeignKey(
        SalesOrder, on_delete=models.PROTECT, related_name="dispatch_notes"
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    status = models.CharField(
        max_length=20, choices=DispatchNoteStatus.choices, default=DispatchNoteStatus.DRAFT
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_dispatch_company_number"
            ),
        ]


class DispatchNoteLine(BaseModel):
    dispatch = models.ForeignKey(DispatchNote, on_delete=models.CASCADE, related_name="lines")
    sales_order_line = models.ForeignKey(
        SalesOrderLine, on_delete=models.PROTECT, related_name="dispatch_lines"
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="ck_dispatchline_qty_positive"
            ),
        ]


class SalesInvoiceStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class SalesInvoice(BaseModel):
    """Commercial AR source document — no GL in Phase 3."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="sales_invoices_typed"
    )
    document_number = models.CharField(max_length=40)
    customer = models.ForeignKey(
        "crm.Customer", on_delete=models.PROTECT, related_name="sales_invoices_typed"
    )
    sales_order = models.ForeignKey(
        SalesOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    dispatch_note = models.ForeignKey(
        DispatchNote,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    status = models.CharField(
        max_length=20, choices=SalesInvoiceStatus.choices, default=SalesInvoiceStatus.DRAFT
    )
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    tax_total = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    total = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    notes = models.TextField(blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_salesinv_company_number"
            ),
        ]


class SalesInvoiceLine(BaseModel):
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField(default=1)
    sales_order_line = models.ForeignKey(
        SalesOrderLine,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoice_lines",
    )
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_price = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    tax_pct = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["invoice", "line_no"], name="uq_salesinvline_inv_lineno"
            ),
        ]
