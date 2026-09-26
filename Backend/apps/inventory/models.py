from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel


class Record(DomainRecord):
    """DomainRecord compatibility shim — not source of truth for typed Item/Lot/LandedCost."""

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "inventory_record"
        verbose_name = "inventory record"


# ---------------------------------------------------------------------------
# UOM
# ---------------------------------------------------------------------------


class UnitOfMeasure(BaseModel):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=20, blank=True)
    is_base_weight = models.BooleanField(
        default=False, help_text="True for KG — preferred weight base for costing"
    )

    class Meta(BaseModel.Meta):
        ordering = ["code"]

    def __str__(self):
        return self.code


class UomConversion(BaseModel):
    """Typed conversion: 1 from_uom = factor × to_uom (e.g. 1 TON = 1000 KG)."""

    from_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="conversions_from"
    )
    to_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="conversions_to"
    )
    factor = models.DecimalField(
        max_digits=24, decimal_places=10, help_text="Multiply qty in from_uom by factor to get to_uom"
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["from_uom", "to_uom"], name="uq_uomconversion_from_to"),
            models.CheckConstraint(condition=models.Q(factor__gt=0), name="ck_uomconversion_factor_positive"),
        ]

    def __str__(self):
        return f"1 {self.from_uom_id} = {self.factor} {self.to_uom_id}"


# ---------------------------------------------------------------------------
# Item master
# ---------------------------------------------------------------------------


class ItemType(models.TextChoices):
    RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
    SEMI_FINISHED = "SEMI_FINISHED", "Semi-Finished"
    FINISHED_GOOD = "FINISHED_GOOD", "Finished Good"
    PACKAGING = "PACKAGING", "Packaging"
    CONSUMABLE = "CONSUMABLE", "Consumable"
    SPARE_PART = "SPARE_PART", "Spare Part"


class PriceBasis(models.TextChoices):
    PER_UOM = "PER_UOM", "Per purchase/stock UOM"
    PER_KG = "PER_KG", "Per kilogram"
    PER_WEIGHT = "PER_WEIGHT", "Per weight (base weight UOM)"


class ValuationMethod(models.TextChoices):
    FIFO = "FIFO", "FIFO"
    WEIGHTED_AVERAGE = "WEIGHTED_AVERAGE", "Weighted Average"
    STANDARD = "STANDARD", "Standard Cost"


class Item(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="items"
    )
    sku = models.CharField(max_length=60)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    item_type = models.CharField(max_length=30, choices=ItemType.choices)
    category = models.CharField(max_length=100, blank=True)

    base_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="items_base"
    )
    purchase_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="items_purchase"
    )
    stock_uom = models.ForeignKey(
        UnitOfMeasure, on_delete=models.PROTECT, related_name="items_stock"
    )
    production_uom = models.ForeignKey(
        UnitOfMeasure,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="items_production",
    )

    weight_per_unit = models.DecimalField(
        max_digits=18, decimal_places=6, null=True, blank=True, help_text="Weight in KG per base UOM unit"
    )
    density = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    price_basis = models.CharField(max_length=20, choices=PriceBasis.choices, default=PriceBasis.PER_UOM)

    preferred_supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="preferred_items",
    )
    supplier_item_code = models.CharField(max_length=80, blank=True)

    batch_tracking = models.BooleanField(default=True)
    expiry_tracking = models.BooleanField(default=False)
    qc_required = models.BooleanField(default=True)
    fifo_eligible = models.BooleanField(default=True)

    reorder_level = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    safety_stock = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    minimum_order_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    maximum_stock = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)

    standard_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    valuation_method = models.CharField(
        max_length=30, choices=ValuationMethod.choices, default=ValuationMethod.FIFO
    )
    tax_category = models.ForeignKey(
        "organization.TaxCategory",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="items",
    )
    specifications = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["company", "sku"], name="uq_item_company_sku"),
        ]
        indexes = [
            models.Index(fields=["company", "item_type", "is_active"], name="ix_item_company_type"),
        ]

    def __str__(self):
        return f"{self.sku} — {self.name}"


class ItemUom(BaseModel):
    """Alternate UOM for an item with conversion factor to the item's base UOM."""

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="alternate_uoms")
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="item_uoms")
    factor_to_base = models.DecimalField(
        max_digits=24,
        decimal_places=10,
        help_text="1 alternate UOM = factor_to_base × item.base_uom",
    )
    is_purchase = models.BooleanField(default=False)
    is_stock = models.BooleanField(default=False)
    is_production = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["item", "uom"], name="uq_itemuom_item_uom"),
            models.CheckConstraint(condition=models.Q(factor_to_base__gt=0), name="ck_itemuom_factor_positive"),
        ]

    def __str__(self):
        return f"{self.item.sku}: {self.uom.code} → base ×{self.factor_to_base}"


class SupplierItemPrice(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="supplier_prices")
    supplier = models.ForeignKey(
        "procurement.Supplier", on_delete=models.PROTECT, related_name="item_prices"
    )
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="+")
    currency = models.ForeignKey(
        "organization.Currency", on_delete=models.PROTECT, related_name="+"
    )
    unit_price = models.DecimalField(max_digits=18, decimal_places=6)
    price_basis = models.CharField(max_length=20, choices=PriceBasis.choices, default=PriceBasis.PER_UOM)
    supplier_item_code = models.CharField(max_length=80, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    minimum_order_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="ck_supplierprice_non_negative"),
        ]
        indexes = [
            models.Index(fields=["item", "supplier"], name="ix_supplierprice_item_sup"),
        ]

    def __str__(self):
        return f"{self.item.sku} @ {self.supplier.code}: {self.unit_price}"


# ---------------------------------------------------------------------------
# Lot / batch foundation
# ---------------------------------------------------------------------------


class LotStatus(models.TextChoices):
    RECEIVED = "RECEIVED", "Received"
    QC_HOLD = "QC_HOLD", "QC Hold"
    AVAILABLE = "AVAILABLE", "Available"
    QUARANTINED = "QUARANTINED", "Quarantined"
    REJECTED = "REJECTED", "Rejected"
    CONSUMED = "CONSUMED", "Consumed"
    EXPIRED = "EXPIRED", "Expired"


LOT_STATUS_TRANSITIONS: dict[str, set[str]] = {
    LotStatus.RECEIVED: {LotStatus.QC_HOLD},
    LotStatus.QC_HOLD: {LotStatus.AVAILABLE, LotStatus.QUARANTINED, LotStatus.REJECTED},
    LotStatus.AVAILABLE: {LotStatus.CONSUMED, LotStatus.EXPIRED, LotStatus.QUARANTINED},
    LotStatus.QUARANTINED: {LotStatus.AVAILABLE, LotStatus.REJECTED, LotStatus.EXPIRED},
    LotStatus.REJECTED: set(),
    LotStatus.CONSUMED: set(),
    LotStatus.EXPIRED: set(),
}


class InventoryLot(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="inventory_lots"
    )
    lot_number = models.CharField(max_length=80)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="lots")
    supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="lots",
    )
    supplier_lot_number = models.CharField(max_length=80, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)

    # Opaque string refs kept for compatibility; typed GRN is authoritative when set
    source_grn_reference = models.CharField(max_length=80, blank=True)
    source_grn = models.ForeignKey(
        "procurement.GoodsReceiptNote",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="lots",
    )
    purchase_reference = models.CharField(max_length=80, blank=True)
    genealogy_reference = models.CharField(max_length=120, blank=True)
    certificate_coa_reference = models.CharField(max_length=120, blank=True)

    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="lots",
    )
    bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="lots",
    )

    status = models.CharField(max_length=20, choices=LotStatus.choices, default=LotStatus.RECEIVED)
    qc_status = models.CharField(max_length=40, blank=True, help_text="Free-text QC snapshot until QC module")

    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="+")
    initial_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    remaining_quantity = models.DecimalField(max_digits=18, decimal_places=6)

    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    purchase_unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    landed_unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Derived from landed components; never replaces purchase_unit_cost",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["company", "lot_number"], name="uq_lot_company_number"),
            models.CheckConstraint(
                condition=models.Q(initial_quantity__gte=0), name="ck_lot_initial_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(remaining_quantity__gte=0), name="ck_lot_remaining_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_unit_cost__gte=0), name="ck_lot_purchase_cost_non_neg"
            ),
        ]
        indexes = [
            models.Index(fields=["company", "item", "status"], name="ix_lot_company_item_status"),
        ]

    def __str__(self):
        return f"{self.lot_number} ({self.item.sku})"

    def clean(self):
        if self.remaining_quantity is not None and self.initial_quantity is not None:
            if self.remaining_quantity > self.initial_quantity:
                raise ValidationError({"remaining_quantity": "Cannot exceed initial_quantity."})


class InventoryReceiptLayer(BaseModel):
    """
    FIFO foundation layer. Phase 2 consumption must use business rules
    (receipt sequence, QC, reservation) — not a naive created_at sort alone.
    """

    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="receipt_layers"
    )
    lot = models.ForeignKey(InventoryLot, on_delete=models.PROTECT, related_name="receipt_layers")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="receipt_layers")
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="receipt_layers",
    )
    bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="receipt_layers",
    )
    received_at = models.DateTimeField()
    receipt_sequence = models.PositiveBigIntegerField(
        help_text="Monotonic sequence for FIFO ordering within company/item"
    )
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="+")
    initial_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    remaining_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    reserved_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    purchase_unit_cost = models.DecimalField(max_digits=18, decimal_places=6)
    landed_unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    currency = models.ForeignKey(
        "organization.Currency",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    qc_status = models.CharField(max_length=40, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "item", "receipt_sequence"],
                name="uq_receiptlayer_company_item_seq",
            ),
            models.CheckConstraint(
                condition=models.Q(initial_quantity__gte=0), name="ck_layer_initial_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(remaining_quantity__gte=0), name="ck_layer_remaining_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(reserved_quantity__gte=0), name="ck_layer_reserved_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_unit_cost__gte=0), name="ck_layer_purchase_cost_non_neg"
            ),
        ]
        indexes = [
            models.Index(
                fields=["company", "item", "receipt_sequence"],
                name="ix_layer_fifo_order",
            ),
        ]
        ordering = ["receipt_sequence"]

    def __str__(self):
        return f"Layer {self.receipt_sequence} / {self.lot.lot_number}"


# ---------------------------------------------------------------------------
# Landed cost foundation
# ---------------------------------------------------------------------------


class LandedCostCategory(models.TextChoices):
    MATERIAL = "MATERIAL", "Material"
    INTERNATIONAL_FREIGHT = "INTERNATIONAL_FREIGHT", "International Freight"
    INSURANCE = "INSURANCE", "Insurance"
    SHIPPING = "SHIPPING", "Shipping"
    CUSTOMS_DUTY = "CUSTOMS_DUTY", "Customs Duty"
    CUSTOMS_TAX = "CUSTOMS_TAX", "Customs Tax"
    VAT = "VAT", "VAT"
    CLEARING = "CLEARING", "Clearing"
    PORT_HANDLING = "PORT_HANDLING", "Port Handling"
    NEPAL_TRANSPORT = "NEPAL_TRANSPORT", "Nepal Transport"
    LOCAL_HANDLING = "LOCAL_HANDLING", "Local Handling"
    BANK_CHARGES = "BANK_CHARGES", "Bank Charges"
    OTHER_DIRECT_COST = "OTHER_DIRECT_COST", "Other Direct Cost"


class AllocationBasis(models.TextChoices):
    QUANTITY = "QUANTITY", "Quantity"
    WEIGHT = "WEIGHT", "Weight"
    VALUE = "VALUE", "Value"
    VOLUME = "VOLUME", "Volume"
    EQUAL = "EQUAL", "Equal"
    MANUAL = "MANUAL", "Manual"


class LandedCostDocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PREVIEWED = "PREVIEWED", "Previewed"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class LandedCostDocument(BaseModel):
    company = models.ForeignKey(
        "organization.Company", on_delete=models.PROTECT, related_name="landed_cost_documents"
    )
    document_number = models.CharField(max_length=40)
    reference = models.CharField(max_length=100, blank=True)
    lot = models.ForeignKey(
        InventoryLot,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="landed_cost_documents",
    )
    currency = models.ForeignKey(
        "organization.Currency", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=20,
        choices=LandedCostDocumentStatus.choices,
        default=LandedCostDocumentStatus.DRAFT,
    )
    # Snapshot of purchase value so it is never lost when landed is calculated
    purchase_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    purchase_unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    purchase_value = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    notes = models.TextField(blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "document_number"], name="uq_lcdoc_company_number"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_quantity__gte=0), name="ck_lcdoc_purchase_qty_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_unit_cost__gte=0), name="ck_lcdoc_purchase_unit_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_value__gte=0), name="ck_lcdoc_purchase_value_non_neg"
            ),
        ]

    def __str__(self):
        return self.document_number


class LandedCostComponent(BaseModel):
    document = models.ForeignKey(
        LandedCostDocument, on_delete=models.CASCADE, related_name="components"
    )
    category = models.CharField(max_length=40, choices=LandedCostCategory.choices)
    description = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=4)
    currency = models.ForeignKey(
        "organization.Currency", on_delete=models.PROTECT, related_name="+"
    )
    exchange_rate = models.DecimalField(
        max_digits=18, decimal_places=8, default=Decimal("1"), help_text="To company base currency"
    )
    base_currency_amount = models.DecimalField(max_digits=18, decimal_places=4)
    supplier = models.ForeignKey(
        "procurement.Supplier",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="landed_cost_components",
    )
    source_document = models.CharField(max_length=80, blank=True)
    source_document_number = models.CharField(max_length=80, blank=True)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    cost_date = models.DateField(null=True, blank=True)
    allocation_basis = models.CharField(
        max_length=20, choices=AllocationBasis.choices, default=AllocationBasis.VALUE
    )
    status = models.CharField(max_length=20, default="DRAFT")
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gte=0), name="ck_lccomp_amount_non_neg"),
            models.CheckConstraint(
                condition=models.Q(exchange_rate__gt=0), name="ck_lccomp_fx_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(base_currency_amount__gte=0), name="ck_lccomp_base_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(tax_amount__gte=0), name="ck_lccomp_tax_non_neg"
            ),
        ]

    def __str__(self):
        return f"{self.category}: {self.base_currency_amount}"


class LandedCostAllocation(BaseModel):
    document = models.ForeignKey(
        LandedCostDocument, on_delete=models.CASCADE, related_name="allocations"
    )
    component = models.ForeignKey(
        LandedCostComponent, on_delete=models.CASCADE, related_name="allocations"
    )
    lot = models.ForeignKey(
        InventoryLot, null=True, blank=True, on_delete=models.PROTECT, related_name="cost_allocations"
    )
    item = models.ForeignKey(
        Item, null=True, blank=True, on_delete=models.PROTECT, related_name="cost_allocations"
    )
    allocation_basis = models.CharField(max_length=20, choices=AllocationBasis.choices)
    basis_value = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("0"))
    allocated_amount = models.DecimalField(max_digits=18, decimal_places=4)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(allocated_amount__gte=0), name="ck_lcalloc_amount_non_neg"
            ),
            models.CheckConstraint(
                condition=models.Q(basis_value__gte=0), name="ck_lcalloc_basis_non_neg"
            ),
        ]

    def __str__(self):
        return f"Alloc {self.allocated_amount} ({self.allocation_basis})"


from apps.inventory.ledger import (  # noqa: E402,F401
    ReservationStatus,
    StockLedgerEntry,
    StockReservation,
    StockTxnType,
)
