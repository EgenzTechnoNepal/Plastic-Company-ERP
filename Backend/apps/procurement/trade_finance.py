"""Phase 1 trade finance — Proforma Invoice + Letter of Credit (import LC workflow)."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class ProformaInvoiceStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    RECEIVED = "RECEIVED", "Received from seller"
    ACCEPTED = "ACCEPTED", "Accepted"
    SUPERSEDED = "SUPERSEDED", "Superseded"
    CANCELLED = "CANCELLED", "Cancelled"


class LetterOfCreditStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft (application)"
    DRAFT_LC_SCANNED = "DRAFT_LC_SCANNED", "Draft LC scanned"
    AI_MATCH_FAILED = "AI_MATCH_FAILED", "AI match failed"
    AI_MATCH_PASSED = "AI_MATCH_PASSED", "AI match passed"
    SELLER_APPROVED = "SELLER_APPROVED", "Seller approved draft"
    FINAL_ISSUED = "FINAL_ISSUED", "Final LC issued"
    MANUFACTURING = "MANUFACTURING", "Seller manufacturing"
    DOCS_PENDING = "DOCS_PENDING", "Pre-dispatch docs pending"
    DOCS_CLEARED = "DOCS_CLEARED", "Pre-dispatch cleared"
    DOCS_BLOCKED = "DOCS_BLOCKED", "Pre-dispatch blocked"
    CLOSED = "CLOSED", "Closed"
    CANCELLED = "CANCELLED", "Cancelled"


LC_TRANSITIONS = {
    LetterOfCreditStatus.DRAFT: {
        LetterOfCreditStatus.DRAFT_LC_SCANNED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.DRAFT_LC_SCANNED: {
        LetterOfCreditStatus.AI_MATCH_PASSED,
        LetterOfCreditStatus.AI_MATCH_FAILED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.AI_MATCH_FAILED: {
        LetterOfCreditStatus.DRAFT_LC_SCANNED,  # re-scan after bank fix
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.AI_MATCH_PASSED: {
        LetterOfCreditStatus.SELLER_APPROVED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.SELLER_APPROVED: {
        LetterOfCreditStatus.FINAL_ISSUED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.FINAL_ISSUED: {
        LetterOfCreditStatus.MANUFACTURING,
        LetterOfCreditStatus.DOCS_PENDING,
        LetterOfCreditStatus.CLOSED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.MANUFACTURING: {
        LetterOfCreditStatus.DOCS_PENDING,
        LetterOfCreditStatus.CLOSED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.DOCS_PENDING: {
        LetterOfCreditStatus.DOCS_CLEARED,
        LetterOfCreditStatus.DOCS_BLOCKED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.DOCS_BLOCKED: {
        LetterOfCreditStatus.DOCS_PENDING,  # re-upload
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.DOCS_CLEARED: {
        LetterOfCreditStatus.CLOSED,
        LetterOfCreditStatus.CANCELLED,
    },
    LetterOfCreditStatus.CLOSED: set(),
    LetterOfCreditStatus.CANCELLED: set(),
}


def default_lc_document_checklist() -> dict:
    """Documents seller must send before dispatch (per client LC / भन्सार shield)."""
    items = [
        ("commercial_invoice", "Commercial Invoice"),
        ("packing_list", "Packing List"),
        ("bill_of_lading", "Bill of Lading / Transport document"),
        ("coa", "Certificate of Analysis (CoA)"),
        ("certificate_of_origin", "Certificate of Origin"),
        ("insurance", "Insurance certificate"),
        ("compliance_iso", "ISO / compliance copy"),
    ]
    return {
        "items": [
            {
                "key": key,
                "label": label,
                "required": key
                in {
                    "commercial_invoice",
                    "packing_list",
                    "bill_of_lading",
                    "coa",
                },
                "confirmed": False,
                "present_in_packet": False,
                "file_url": "",
            }
            for key, label in items
        ]
    }


class ProformaInvoice(BaseModel):
    """Seller Proforma Invoice linked to a typed Purchase Order."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="proforma_invoices"
    )
    document_number = models.CharField(max_length=40)
    purchase_order = models.ForeignKey(
        "procurement.PurchaseOrder",
        on_delete=models.PROTECT,
        related_name="proforma_invoices",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="proforma_invoices"
    )
    status = models.CharField(
        max_length=20,
        choices=ProformaInvoiceStatus.choices,
        default=ProformaInvoiceStatus.DRAFT,
    )
    seller_pi_number = models.CharField(max_length=80, blank=True)
    currency_code = models.CharField(max_length=10, blank=True, default="USD")
    total_amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    payment_terms = models.CharField(max_length=200, blank=True)
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    attachment_url = models.URLField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"],
                name="uq_proforma_company_doc",
            ),
        ]

    def __str__(self):
        return f"{self.document_number} ({self.status})"


class LetterOfCredit(BaseModel):
    """Import LC lifecycle: Draft scan → AI match PO+PI → Seller OK → Final → pre-dispatch docs."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="letters_of_credit"
    )
    document_number = models.CharField(max_length=40)
    purchase_order = models.ForeignKey(
        "procurement.PurchaseOrder",
        on_delete=models.PROTECT,
        related_name="letters_of_credit",
    )
    proforma_invoice = models.ForeignKey(
        ProformaInvoice,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="letters_of_credit",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="letters_of_credit"
    )
    status = models.CharField(
        max_length=24,
        choices=LetterOfCreditStatus.choices,
        default=LetterOfCreditStatus.DRAFT,
    )
    bank_name = models.CharField(max_length=200, blank=True)
    lc_number = models.CharField(max_length=80, blank=True, help_text="Bank LC reference")
    currency_code = models.CharField(max_length=10, blank=True, default="USD")
    amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    expiry_date = models.DateField(null=True, blank=True)
    latest_shipment_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    # Draft LC scan + AI match
    draft_scan_url = models.URLField(blank=True)
    draft_extracted = models.JSONField(default=dict, blank=True)
    match_result = models.JSONField(default=dict, blank=True)
    seller_approved_at = models.DateTimeField(null=True, blank=True)
    seller_approval_note = models.CharField(max_length=255, blank=True)
    final_issued_at = models.DateTimeField(null=True, blank=True)
    final_lc_number = models.CharField(max_length=80, blank=True)

    document_checklist = models.JSONField(default=default_lc_document_checklist, blank=True)
    pre_dispatch_message = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"],
                name="uq_lc_company_doc",
            ),
        ]

    def __str__(self):
        return f"{self.document_number} ({self.status})"
