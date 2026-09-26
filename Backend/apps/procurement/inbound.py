"""Phase 2 inbound documents: shipment, gate entry, GRN."""

from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class GateEntryStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    LINKED_TO_GRN = "LINKED_TO_GRN", "Linked to GRN"
    CANCELLED = "CANCELLED", "Cancelled"


GATE_ENTRY_TRANSITIONS = {
    GateEntryStatus.DRAFT: {GateEntryStatus.SUBMITTED, GateEntryStatus.CANCELLED},
    GateEntryStatus.SUBMITTED: {GateEntryStatus.LINKED_TO_GRN, GateEntryStatus.CANCELLED},
    GateEntryStatus.LINKED_TO_GRN: set(),
    GateEntryStatus.CANCELLED: set(),
}


class GrnStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class ImportShipment(BaseModel):
    """Import/shipment context for inbound material (not full PO engine)."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="import_shipments"
    )
    shipment_number = models.CharField(max_length=40)
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="import_shipments"
    )
    incoterm = models.ForeignKey(
        "procurement.Incoterm",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="import_shipments",
    )
    named_place = models.CharField(max_length=200, blank=True)
    purchase_reference = models.CharField(max_length=80, blank=True)
    purchase_order = models.ForeignKey(
        "procurement.PurchaseOrder",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="import_shipments",
    )
    etd = models.DateField(null=True, blank=True)
    eta = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "shipment_number"], name="uq_importshipment_company_number"
            ),
        ]

    def __str__(self):
        return self.shipment_number


class GateEntry(BaseModel):
    """Physical arrival — does not create stock."""

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="gate_entries"
    )
    gate_entry_number = models.CharField(max_length=40)
    entry_at = models.DateTimeField()
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="gate_entries"
    )
    shipment = models.ForeignKey(
        ImportShipment,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="gate_entries",
    )
    purchase_reference = models.CharField(max_length=80, blank=True)
    purchase_order = models.ForeignKey(
        "procurement.PurchaseOrder",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="gate_entries",
    )
    vehicle_number = models.CharField(max_length=60, blank=True)
    driver_name = models.CharField(max_length=120, blank=True)
    material_reference = models.CharField(max_length=200, blank=True)
    quantity_note = models.CharField(max_length=100, blank=True)
    document_references = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=GateEntryStatus.choices, default=GateEntryStatus.DRAFT
    )

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Gate entries"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "gate_entry_number"], name="uq_gateentry_company_number"
            ),
        ]

    def __str__(self):
        return self.gate_entry_number


class GoodsReceiptNote(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="goods_receipts"
    )
    grn_number = models.CharField(max_length=40)
    gate_entry = models.ForeignKey(
        GateEntry,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="goods_receipts",
    )
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="goods_receipts"
    )
    shipment = models.ForeignKey(
        ImportShipment,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="goods_receipts",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse", on_delete=models.PROTECT, related_name="goods_receipts"
    )
    receiving_bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="receiving_grns",
    )
    purchase_reference = models.CharField(max_length=80, blank=True)
    received_at = models.DateTimeField()
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    status = models.CharField(max_length=20, choices=GrnStatus.choices, default=GrnStatus.DRAFT)
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    notes = models.TextField(blank=True)
    # Compatibility mirror for DomainRecord UI (optional metadata only — not stock truth)
    domain_record_id = models.UUIDField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "grn_number"], name="uq_grn_company_number"
            ),
        ]

    def __str__(self):
        return self.grn_number


class GoodsReceiptLine(BaseModel):
    grn = models.ForeignKey(GoodsReceiptNote, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey("inventory.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.ForeignKey("inventory.UnitOfMeasure", on_delete=models.PROTECT, related_name="+")
    received_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    accepted_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    rejected_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    purchase_unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    supplier_lot_number = models.CharField(max_length=80, blank=True)
    lot_number = models.CharField(max_length=80, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grn_lines",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grn_lines",
    )
    purchase_order_line = models.ForeignKey(
        "procurement.PurchaseOrderLine",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="grn_lines",
    )
    line_notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(received_quantity__gte=0), name="ck_grnline_recv_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(accepted_quantity__gte=0), name="ck_grnline_acc_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(rejected_quantity__gte=0), name="ck_grnline_rej_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_unit_cost__gte=0), name="ck_grnline_cost_non_neg"
            ),
        ]
