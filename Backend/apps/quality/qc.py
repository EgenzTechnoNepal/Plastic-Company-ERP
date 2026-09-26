"""Phase 2 QC inspection — hard inventory control boundary."""

from django.db import models

from apps.core.models import BaseModel


class QCInspectionStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PASSED = "PASSED", "Passed"
    FAILED = "FAILED", "Failed"


class QCFailDisposition(models.TextChoices):
    QUARANTINED = "QUARANTINED", "Quarantined"
    REJECTED = "REJECTED", "Rejected"


class QCInspection(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="qc_inspections"
    )
    inspection_number = models.CharField(max_length=40)
    grn = models.ForeignKey(
        "procurement.GoodsReceiptNote",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="qc_inspections",
    )
    lot = models.ForeignKey(
        "inventory.InventoryLot", on_delete=models.PROTECT, related_name="qc_inspections"
    )
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    status = models.CharField(
        max_length=20, choices=QCInspectionStatus.choices, default=QCInspectionStatus.DRAFT
    )
    fail_disposition = models.CharField(
        max_length=20, choices=QCFailDisposition.choices, blank=True
    )
    inspected_at = models.DateTimeField(null=True, blank=True)
    inspected_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    remarks = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "inspection_number"], name="uq_qcinspection_company_number"
            ),
        ]

    def __str__(self):
        return self.inspection_number
