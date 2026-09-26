"""Phase 2 warehouse operations: putaway, transfer, adjustment, cycle count."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class OpsDocStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class PutawayOrder(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="putaway_orders"
    )
    putaway_number = models.CharField(max_length=40)
    lot = models.ForeignKey("inventory.InventoryLot", on_delete=models.PROTECT, related_name="putaways")
    from_bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    to_warehouse = models.ForeignKey(
        "warehouse.Warehouse", on_delete=models.PROTECT, related_name="+"
    )
    to_bin = models.ForeignKey("warehouse.Bin", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    status = models.CharField(max_length=20, choices=OpsDocStatus.choices, default=OpsDocStatus.DRAFT)
    posted_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "putaway_number"], name="uq_putaway_company_number"
            ),
        ]


class StockTransfer(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="stock_transfers_typed"
    )
    transfer_number = models.CharField(max_length=40)
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    lot = models.ForeignKey("inventory.InventoryLot", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    from_warehouse = models.ForeignKey(
        "warehouse.Warehouse", on_delete=models.PROTECT, related_name="+"
    )
    from_bin = models.ForeignKey("warehouse.Bin", on_delete=models.PROTECT, related_name="+")
    to_warehouse = models.ForeignKey(
        "warehouse.Warehouse", on_delete=models.PROTECT, related_name="+"
    )
    to_bin = models.ForeignKey("warehouse.Bin", on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=20, choices=OpsDocStatus.choices, default=OpsDocStatus.DRAFT)
    posted_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "transfer_number"], name="uq_stocktransfer_company_number"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="ck_stocktransfer_qty_positive"
            ),
        ]


class StockAdjustment(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="stock_adjustments_typed"
    )
    adjustment_number = models.CharField(max_length=40)
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="adjustments",
        help_text="Required for layer-level adjustments; never silently pick first layer",
    )
    warehouse = models.ForeignKey("warehouse.Warehouse", on_delete=models.PROTECT, related_name="+")
    bin = models.ForeignKey(
        "warehouse.Bin", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    quantity_delta = models.DecimalField(
        max_digits=18, decimal_places=6, help_text="Positive = increase, negative = decrease"
    )
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    reason = models.CharField(max_length=255)
    reference = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=OpsDocStatus.choices, default=OpsDocStatus.DRAFT)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "adjustment_number"], name="uq_stockadj_company_number"
            ),
        ]


class CycleCountSession(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="cycle_count_sessions"
    )
    session_number = models.CharField(max_length=40)
    warehouse = models.ForeignKey("warehouse.Warehouse", on_delete=models.PROTECT, related_name="+")
    bin = models.ForeignKey(
        "warehouse.Bin", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=20, choices=OpsDocStatus.choices, default=OpsDocStatus.DRAFT)
    posted_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    adjustment = models.ForeignKey(
        StockAdjustment,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cycle_counts",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "session_number"], name="uq_cyclecount_company_number"
            ),
        ]


class CycleCountLine(BaseModel):
    session = models.ForeignKey(CycleCountSession, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cycle_count_lines",
    )
    expected_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    counted_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    variance = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))

    class Meta(BaseModel.Meta):
        pass
