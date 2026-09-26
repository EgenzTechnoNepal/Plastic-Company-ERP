from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    """DomainRecord compatibility shim — not source of truth for typed warehouse hierarchy."""

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "warehouse_record"
        verbose_name = "warehouse record"


class BinType(models.TextChoices):
    RECEIVING = "RECEIVING", "Receiving"
    QC_HOLD = "QC_HOLD", "QC Hold"
    QUARANTINE = "QUARANTINE", "Quarantine"
    RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
    PRODUCTION = "PRODUCTION", "Production"
    FINISHED_GOODS = "FINISHED_GOODS", "Finished Goods"
    REJECTED = "REJECTED", "Rejected"
    DISPATCH = "DISPATCH", "Dispatch"
    GENERAL = "GENERAL", "General"


class Warehouse(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="warehouses"
    )
    branch = models.ForeignKey(
        "organization.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="warehouses",
    )
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=150)
    address = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="uq_warehouse_company_code"),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Zone(BaseModel):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="zones")
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=150)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["warehouse", "code"], name="uq_zone_warehouse_code"),
        ]

    def __str__(self):
        return f"{self.warehouse.code}/{self.code}"


class Rack(BaseModel):
    zone = models.ForeignKey(Zone, on_delete=models.PROTECT, related_name="racks")
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=150, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["zone", "code"], name="uq_rack_zone_code"),
        ]

    def __str__(self):
        return f"{self.zone}/{self.code}"


class Bin(BaseModel):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="bins")
    zone = models.ForeignKey(Zone, null=True, blank=True, on_delete=models.PROTECT, related_name="bins")
    rack = models.ForeignKey(Rack, null=True, blank=True, on_delete=models.PROTECT, related_name="bins")
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=150, blank=True)
    bin_type = models.CharField(max_length=30, choices=BinType.choices, default=BinType.GENERAL)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["warehouse", "code"], name="uq_bin_warehouse_code"),
        ]
        indexes = [
            models.Index(fields=["warehouse", "bin_type"], name="ix_bin_wh_type"),
        ]

    def __str__(self):
        return f"{self.warehouse.code}/{self.code}"


from apps.warehouse.operations import (  # noqa: E402,F401
    CycleCountLine,
    CycleCountSession,
    OpsDocStatus,
    PutawayOrder,
    StockAdjustment,
    StockTransfer,
)
