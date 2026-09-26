from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    """DomainRecord compatibility shim — not source of truth for typed Supplier/Incoterm."""

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "procurement_record"
        verbose_name = "procurement record"


class IncotermCode(models.TextChoices):
    EXW = "EXW", "Ex Works"
    FCA = "FCA", "Free Carrier"
    FAS = "FAS", "Free Alongside Ship"
    FOB = "FOB", "Free On Board"
    CFR = "CFR", "Cost and Freight"
    CIF = "CIF", "Cost, Insurance and Freight"
    CIP = "CIP", "Carriage and Insurance Paid To"
    CPT = "CPT", "Carriage Paid To"
    DAP = "DAP", "Delivered At Place"
    DPU = "DPU", "Delivered at Place Unloaded"
    DDP = "DDP", "Delivered Duty Paid"


class Incoterm(BaseModel):
    """Incoterms® 2020 catalog entry. Named place/port belongs on PO/shipment (Phase 2+)."""

    code = models.CharField(max_length=3, choices=IncotermCode.choices, unique=True)
    version = models.CharField(max_length=10, default="2020")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    # Optional default named place template (actual place still set per transaction later)
    default_named_place = models.CharField(max_length=200, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} ({self.version})"


class SupplierQualityStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    CONDITIONAL = "conditional", "Conditional"
    BLOCKED = "blocked", "Blocked"


class Supplier(BaseModel):
    """Typed supplier master — reusable by Procurement, Inventory, QC, Accounting."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="suppliers"
    )
    code = models.CharField(max_length=40)
    legal_name = models.CharField(max_length=255)
    trading_name = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    tax_id = models.CharField(max_length=50, blank=True, help_text="PAN / VAT / tax registration")
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="suppliers",
    )
    payment_terms = models.CharField(max_length=100, blank=True)
    preferred_incoterm = models.ForeignKey(
        Incoterm,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="suppliers",
    )
    quality_status = models.CharField(
        max_length=20,
        choices=SupplierQualityStatus.choices,
        default=SupplierQualityStatus.PENDING,
    )
    quality_rating = models.DecimalField(
        max_digits=4, decimal_places=2, null=True, blank=True, help_text="Placeholder 0–100 rating"
    )
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="uq_supplier_company_code"),
        ]
        indexes = [
            models.Index(fields=["company", "is_active"], name="ix_supplier_company_active"),
        ]

    def __str__(self):
        return f"{self.code} — {self.trading_name or self.legal_name}"


class SupplierDocument(BaseModel):
    """Document / certificate metadata for a supplier (file storage may be external)."""

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(max_length=200)
    document_type = models.CharField(max_length=50, blank=True)
    reference_number = models.CharField(max_length=100, blank=True)
    file_url = models.URLField(blank=True)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.supplier.code}: {self.title}"


# Phase 2 inbound documents (must import so Django registers models)
from apps.procurement.inbound import (  # noqa: E402,F401
    GATE_ENTRY_TRANSITIONS,
    GateEntry,
    GateEntryStatus,
    GoodsReceiptLine,
    GoodsReceiptNote,
    GrnStatus,
    ImportShipment,
)

# Phase 3 Slice A commercial documents
from apps.procurement.commercial import (  # noqa: E402,F401
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    SupplierBill,
    SupplierBillLine,
    SupplierBillMatchStatus,
    SupplierBillStatus,
)
