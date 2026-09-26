from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    """DomainRecord compatibility shim — not source of truth for typed Customer."""

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "crm_record"
        verbose_name = "crm record"


class Customer(BaseModel):
    """Typed customer stub for AR / sales foundations (Phase 3+)."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="customers"
    )
    code = models.CharField(max_length=40)
    legal_name = models.CharField(max_length=255)
    trading_name = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    tax_id = models.CharField(max_length=50, blank=True)
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="customers",
    )
    payment_terms = models.CharField(max_length=100, blank=True)
    credit_limit = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="uq_customer_company_code"),
        ]

    def __str__(self):
        return f"{self.code} — {self.trading_name or self.legal_name}"
