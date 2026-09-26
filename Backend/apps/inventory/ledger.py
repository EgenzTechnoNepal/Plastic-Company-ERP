"""Phase 2 stock ledger and reservations — inventory source of truth for quantities."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class StockTxnType(models.TextChoices):
    GRN_RECEIPT = "GRN_RECEIPT", "GRN Receipt"
    QC_RELEASE = "QC_RELEASE", "QC Release"
    QC_REJECT = "QC_REJECT", "QC Reject"
    PUTAWAY = "PUTAWAY", "Putaway"
    TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"
    TRANSFER_IN = "TRANSFER_IN", "Transfer In"
    ADJUSTMENT_IN = "ADJUSTMENT_IN", "Adjustment In"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT", "Adjustment Out"
    RESERVATION = "RESERVATION", "Reservation"
    RESERVATION_RELEASE = "RESERVATION_RELEASE", "Reservation Release"
    ISSUE = "ISSUE", "Issue"
    ISSUE_RETURN = "ISSUE_RETURN", "Issue Return"
    LANDED_COST_REVALUE = "LANDED_COST_REVALUE", "Landed Cost Revalue"


class StockLedgerEntry(BaseModel):
    """
    Immutable stock movement. Soft-delete / is_active must not be used to erase history.
    Updates and deletes are rejected at the service/API layer.
    """

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="stock_ledger_entries"
    )
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="ledger_entries")
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    txn_type = models.CharField(max_length=30, choices=StockTxnType.choices)
    quantity_in = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    quantity_out = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    total_cost = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    reference_type = models.CharField(max_length=40)
    reference_id = models.UUIDField()
    reason = models.CharField(max_length=255, blank=True)
    occurred_at = models.DateTimeField()
    reversal_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reversals",
    )

    class Meta(BaseModel.Meta):
        ordering = ["occurred_at", "created_at"]
        indexes = [
            models.Index(fields=["company", "item", "occurred_at"], name="ix_ledger_company_item_time"),
            models.Index(fields=["reference_type", "reference_id"], name="ix_ledger_reference"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_in__gte=0), name="ck_ledger_qty_in_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_out__gte=0), name="ck_ledger_qty_out_non_neg"
            ),
            models.CheckConstraint(
                condition=~(models.Q(quantity_in__gt=0) & models.Q(quantity_out__gt=0)),
                name="ck_ledger_not_both_in_out",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("StockLedgerEntry is immutable and cannot be updated.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("StockLedgerEntry is immutable and cannot be deleted.")


class ReservationStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    RELEASED = "RELEASED", "Released"
    CANCELLED = "CANCELLED", "Cancelled"


class StockReservation(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="stock_reservations"
    )
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="reservations")
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    reference_type = models.CharField(max_length=40, blank=True)
    reference_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=ReservationStatus.choices, default=ReservationStatus.OPEN
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="ck_reservation_qty_positive"
            ),
        ]
