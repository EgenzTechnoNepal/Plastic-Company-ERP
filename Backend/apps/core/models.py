"""
Reusable abstract base models shared across every ERP module.

BaseModel gives every entity a UUID public identifier plus a uniform audit
trail (created/updated by + timestamps) and a soft-delete flag.

DocumentModel extends BaseModel for transactional documents (sales orders,
purchase orders, GRNs, journals, ...): it adds a human-readable document
number, workflow status and submit/approve/cancel bookkeeping. It does NOT
replace the centralized apps.audit.AuditLog — that remains the single
non-erasable record of who changed what.
"""

import uuid

from django.conf import settings
from django.db import models


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_updated",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class DocumentStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    PENDING_APPROVAL = "pending_approval", "Pending Approval"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"
    POSTED = "posted", "Posted"
    REVERSED = "reversed", "Reversed"


class DocumentModel(BaseModel):
    """Abstract parent for every numbered transactional document in the ERP."""

    #: Subclasses set this, e.g. "SO", "PO", "GRN" — used by the numbering service.
    DOCUMENT_PREFIX: str = ""

    document_number = models.CharField(max_length=40, unique=True, editable=False, db_index=True)
    status = models.CharField(max_length=20, choices=DocumentStatus.choices, default=DocumentStatus.DRAFT)
    branch = models.ForeignKey(
        "organization.Branch", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    department = models.ForeignKey(
        "organization.Department", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_approved",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_cancelled",
    )

    class Meta(BaseModel.Meta):
        abstract = True

    def __str__(self):
        return self.document_number or f"{self.DOCUMENT_PREFIX}-DRAFT-{self.pk}"


class DocumentNumberSequence(models.Model):
    """
    Fiscal-year- and branch-aware monotonic counters used to mint document
    numbers. Never generate document numbers client-side; always go through
    apps.core.services.numbering.generate_document_number().
    """

    prefix = models.CharField(max_length=10)
    fiscal_year = models.ForeignKey(
        "organization.FiscalYear", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    branch = models.ForeignKey(
        "organization.Branch", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    last_number = models.PositiveBigIntegerField(default=0)
    padding = models.PositiveSmallIntegerField(default=6)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["prefix", "fiscal_year", "branch"], name="uq_docnumseq_prefix_fy_branch"
            )
        ]

    def __str__(self):
        return f"{self.prefix} (last={self.last_number})"
