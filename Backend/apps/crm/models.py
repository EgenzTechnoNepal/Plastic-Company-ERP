"""CRM typed masters — Customer authority + contacts, addresses, activities.

DomainRecord `Record` remains for leads/opportunities/quotations UI compatibility.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    """DomainRecord compatibility shim — not source of truth for typed Customer."""

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "crm_record"
        verbose_name = "crm record"


class CustomerType(models.TextChoices):
    CORPORATE = "CORPORATE", "Corporate"
    RETAIL = "RETAIL", "Retail"
    GOVERNMENT = "GOVERNMENT", "Government"
    DEALER = "DEALER", "Dealer"
    OTHER = "OTHER", "Other"


class Customer(BaseModel):
    """Typed customer master — sales/AR authority (Phase B CRM)."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="customers"
    )
    code = models.CharField(max_length=40)
    legal_name = models.CharField(max_length=255)
    trading_name = models.CharField(max_length=255, blank=True)
    customer_type = models.CharField(
        max_length=20, choices=CustomerType.choices, default=CustomerType.CORPORATE, blank=True
    )
    country = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True, help_text="Primary / billing address text")
    shipping_address = models.TextField(blank=True)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)
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

    @property
    def display_name(self) -> str:
        return self.trading_name or self.legal_name


class ContactParty(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    SUPPLIER = "SUPPLIER", "Supplier"
    OTHER = "OTHER", "Other"


class Contact(BaseModel):
    """Person contact linked to a customer and/or supplier within one company."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="crm_contacts"
    )
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="contacts",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="contacts",
    )
    party_kind = models.CharField(
        max_length=20, choices=ContactParty.choices, default=ContactParty.CUSTOMER
    )
    name = models.CharField(max_length=150)
    designation = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    alternate_phone = models.CharField(max_length=50, blank=True)
    preferred_channel = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="email | phone | whatsapp (foundation only)",
    )
    is_primary = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["company", "customer"]),
            models.Index(fields=["company", "supplier"]),
        ]

    def __str__(self):
        return self.name


class AddressType(models.TextChoices):
    BILLING = "BILLING", "Billing"
    SHIPPING = "SHIPPING", "Shipping"
    OFFICE = "OFFICE", "Office"
    WAREHOUSE = "WAREHOUSE", "Warehouse"
    OTHER = "OTHER", "Other"


class PartyAddress(BaseModel):
    """Structured address for customer or supplier (company-scoped)."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="party_addresses"
    )
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    address_type = models.CharField(
        max_length=20, choices=AddressType.choices, default=AddressType.BILLING
    )
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=30, blank=True)
    country = models.CharField(max_length=100, blank=True)
    is_primary = models.BooleanField(default=False)
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["company", "customer"]),
            models.Index(fields=["company", "supplier"]),
        ]

    def __str__(self):
        return f"{self.address_type}: {self.line1}"


class ActivityType(models.TextChoices):
    NOTE = "NOTE", "Note"
    CALL = "CALL", "Call"
    EMAIL = "EMAIL", "Email"
    MEETING = "MEETING", "Meeting"
    TASK = "TASK", "Task"


class ActivityStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    DONE = "DONE", "Done"
    CANCELLED = "CANCELLED", "Cancelled"


class CrmActivity(BaseModel):
    """Lightweight CRM activity / history foundation."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="crm_activities"
    )
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    contact = models.ForeignKey(
        Contact,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activities",
    )
    activity_type = models.CharField(
        max_length=20, choices=ActivityType.choices, default=ActivityType.NOTE
    )
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=ActivityStatus.choices, default=ActivityStatus.OPEN
    )
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["company", "customer", "status"]),
            models.Index(fields=["company", "activity_type"]),
        ]
        verbose_name_plural = "CRM activities"

    def __str__(self):
        return f"{self.activity_type}: {self.subject}"
