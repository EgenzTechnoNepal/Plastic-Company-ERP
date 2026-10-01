"""Workflow DomainRecord shim + typed ApprovalRequest foundation (Phase B)."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "workflow_record"
        verbose_name = "workflow record"


class ApprovalStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class ApprovalRequest(BaseModel):
    """
    Minimal reusable approval foundation for later M2 modules.

    Does not mutate inventory/GL. Domain services remain authoritative for
    document state transitions after APPROVED/REJECTED.
    """

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="approval_requests"
    )
    # Module whose APPROVE action is required (e.g. crm, procurement, sales)
    module_code = models.CharField(max_length=40)
    target_type = models.CharField(max_length=100, help_text="e.g. procurement.PurchaseOrder")
    target_id = models.UUIDField()
    document_number = models.CharField(max_length=80, blank=True)
    title = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    requested_at = models.DateTimeField(default=timezone.now)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True)
    decision_reason = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["module_code", "status"]),
        ]

    def __str__(self):
        return f"{self.document_number or self.target_id} [{self.status}]"
