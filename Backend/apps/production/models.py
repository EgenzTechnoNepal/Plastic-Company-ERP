"""
Typed production domain models.

The existing Record model is intentionally retained for compatibility with
the current generic/frontend production API.

Typed production models below are the backend source of truth for M2 business
transactions. Inventory quantities and stock movements must be handled through
the existing inventory services and ledger.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from apps.core.documents import DomainRecord
from apps.core.models import BaseModel, DocumentModel


class Record(DomainRecord):
    """
    Legacy/generic production record.

    Kept for compatibility with the existing frontend and generic production
    endpoints. New core production transactions must use typed models below.
    """

    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "production_record"
        verbose_name = "production record"


class BOMStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class BOMVersionStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class ProductionOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    RELEASED = "RELEASED", "Released"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class ProductionDocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class BOM(BaseModel):
    """
    Bill of Materials master.

    A BOM defines how a finished/semi-finished item is manufactured.
    Version-specific component quantities are stored in BOMVersion/BOMLine.
    """

    company = models.ForeignKey(
        "organization.Company",
        on_delete=models.PROTECT,
        related_name="production_boms",
    )
    code = models.CharField(max_length=60)
    name = models.CharField(max_length=255)
    output_item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.PROTECT,
        related_name="production_boms",
    )
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=BOMStatus.choices,
        default=BOMStatus.DRAFT,
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["company", "code"],
                name="uq_production_bom_company_code",
            ),
        ]
        indexes = [
            models.Index(
                fields=["company", "status"],
                name="ix_prod_bom_company_status",
            ),
            models.Index(
                fields=["company", "output_item"],
                name="ix_prod_bom_company_output",
            ),
        ]

    def clean(self):
        if self.output_item_id and self.output_item.company_id != self.company_id:
            raise ValidationError(
                {"output_item": "BOM output item must belong to the same company."}
            )

    def __str__(self):
        return f"{self.code} - {self.name}"


class BOMVersion(BaseModel):
    """
    Versioned BOM definition.

    A production order references a specific BOM version so that historical
    production remains reproducible even when the BOM changes later.
    """

    bom = models.ForeignKey(
        BOM,
        on_delete=models.PROTECT,
        related_name="versions",
    )
    version = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=BOMVersionStatus.choices,
        default=BOMVersionStatus.DRAFT,
    )
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["bom", "version"],
                name="uq_production_bom_version",
            ),
            models.CheckConstraint(
                condition=models.Q(version__gte=1),
                name="ck_production_bom_version_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["bom", "status"],
                name="ix_prod_bomver_bom_status",
            ),
            models.Index(
                fields=["bom", "effective_from"],
                name="ix_prod_bomver_effective",
            ),
        ]
        ordering = ["bom", "-version"]

    def clean(self):
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError(
                {"effective_to": "Effective-to date cannot be before effective-from date."}
            )

    @property
    def company_id(self):
        return self.bom.company_id

    def __str__(self):
        return f"{self.bom.code} v{self.version}"


class BOMLine(BaseModel):
    """
    Component requirement for one BOM version.
    """

    bom_version = models.ForeignKey(
        BOMVersion,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    component_item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.PROTECT,
        related_name="production_bom_lines",
    )
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
    )
    uom = models.ForeignKey(
        "inventory.UnitOfMeasure",
        on_delete=models.PROTECT,
        related_name="production_bom_lines",
    )
    scrap_percent = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=Decimal("0"),
    )
    sequence = models.PositiveIntegerField(default=1)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["bom_version", "sequence"],
                name="uq_production_bomline_sequence",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="ck_production_bomline_qty_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(scrap_percent__gte=0),
                name="ck_production_bomline_scrap_non_neg",
            ),
        ]
        indexes = [
            models.Index(
                fields=["bom_version", "component_item"],
                name="ix_prod_bomline_component",
            ),
        ]
        ordering = ["sequence", "created_at"]

    def clean(self):
        if self.bom_version_id and self.component_item_id:
            if self.component_item.company_id != self.bom_version.bom.company_id:
                raise ValidationError(
                    {
                        "component_item": (
                            "BOM component item must belong to the same company."
                        )
                    }
                )

        if self.component_item_id and self.uom_id:
            valid_uom = (
                self.component_item.base_uom_id == self.uom_id
                or self.component_item.purchase_uom_id == self.uom_id
                or self.component_item.stock_uom_id == self.uom_id
                or self.component_item.production_uom_id == self.uom_id
                or self.component_item.alternate_uoms.filter(
                    uom_id=self.uom_id
                ).exists()
            )

            if not valid_uom:
                raise ValidationError(
                    {"uom": "UOM is not configured for this component item."}
                )

        if self.bom_version_id and self.component_item_id:
            if self.component_item_id == self.bom_version.bom.output_item_id:
                raise ValidationError(
                    {"component_item": "BOM output item cannot be its own component."}
                )

    def __str__(self):
        return (
            f"{self.bom_version} - "
            f"{self.component_item.sku} - "
            f"{self.quantity} {self.uom.code}"
        )


class ProductionOrder(DocumentModel):
    """
    Production/work order.

    This is the typed transactional replacement for the generic
    production Record entity='work_orders' for new backend workflows.
    """

    DOCUMENT_PREFIX = "MO"

    company = models.ForeignKey(
        "organization.Company",
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    bom_version = models.ForeignKey(
        BOMVersion,
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    output_item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    planned_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
    )
    produced_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=Decimal("0"),
    )
    uom = models.ForeignKey(
        "inventory.UnitOfMeasure",
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    production_bin = models.ForeignKey(
        "warehouse.Bin",
        on_delete=models.PROTECT,
        related_name="production_orders",
    )
    status = models.CharField(
        max_length=20,
        choices=ProductionOrderStatus.choices,
        default=ProductionOrderStatus.DRAFT,
        db_index=True,
    )
    planned_start = models.DateField(null=True, blank=True)
    planned_end = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(DocumentModel.Meta):
        indexes = [
            models.Index(
                fields=["company", "status"],
                name="ix_prod_order_company_status",
            ),
            models.Index(
                fields=["company", "output_item"],
                name="ix_prod_order_output_item",
            ),
            models.Index(
                fields=["company", "warehouse", "status"],
                name="ix_prod_order_wh_status",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(planned_quantity__gt=0),
                name="ck_prod_order_planned_qty_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(produced_quantity__gte=0),
                name="ck_prod_order_produced_qty_non_neg",
            ),
            models.CheckConstraint(
                condition=models.Q(produced_quantity__lte=models.F("planned_quantity")),
                name="ck_prod_order_produced_lte_planned",
            ),
        ]

    def clean(self):
        if self.bom_version_id:
            bom_company_id = self.bom_version.bom.company_id

            if self.company_id != bom_company_id:
                raise ValidationError(
                    {"bom_version": "BOM version must belong to the same company."}
                )

        if self.output_item_id:
            if self.output_item.company_id != self.company_id:
                raise ValidationError(
                    {"output_item": "Output item must belong to the same company."}
                )

        if self.warehouse_id:
            if self.warehouse.company_id != self.company_id:
                raise ValidationError(
                    {"warehouse": "Production warehouse must belong to the same company."}
                )

        if self.production_bin_id:
            if self.production_bin.warehouse_id != self.warehouse_id:
                raise ValidationError(
                    {"production_bin": "Production bin must belong to the selected warehouse."}
                )

        if self.output_item_id and self.uom_id:
            valid_uom = (
                self.output_item.base_uom_id == self.uom_id
                or self.output_item.stock_uom_id == self.uom_id
                or self.output_item.production_uom_id == self.uom_id
                or self.output_item.alternate_uoms.filter(
                    uom_id=self.uom_id
                ).exists()
            )

            if not valid_uom:
                raise ValidationError(
                    {"uom": "UOM is not configured for the output item."}
                )

        if self.planned_end and self.planned_start:
            if self.planned_end < self.planned_start:
                raise ValidationError(
                    {"planned_end": "Planned end cannot be before planned start."}
                )

    def __str__(self):
        return self.document_number or f"MO-DRAFT-{self.pk}"


class MaterialIssue(DocumentModel):
    """
    Typed material-consumption transaction for a production order.

    Posting this document must use the existing inventory reservation/FIFO
    and immutable stock-ledger services. This model itself does not mutate
    inventory quantities.
    """

    DOCUMENT_PREFIX = "MI"

    company = models.ForeignKey(
        "organization.Company",
        on_delete=models.PROTECT,
        related_name="production_material_issues",
    )
    production_order = models.ForeignKey(
        ProductionOrder,
        on_delete=models.PROTECT,
        related_name="material_issues",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        on_delete=models.PROTECT,
        related_name="production_material_issues",
    )
    production_bin = models.ForeignKey(
        "warehouse.Bin",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="production_material_issues",
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=ProductionDocumentStatus.choices,
        default=ProductionDocumentStatus.DRAFT,
        db_index=True,
    )
    notes = models.TextField(blank=True)

    class Meta(DocumentModel.Meta):
        indexes = [
            models.Index(
                fields=["company", "status"],
                name="ix_prod_mi_company_status",
            ),
            models.Index(
                fields=["company", "production_order"],
                name="ix_prod_mi_company_order",
            ),
        ]

    def clean(self):
        if self.production_order_id:
            if self.company_id != self.production_order.company_id:
                raise ValidationError(
                    {"production_order": "Production order must belong to the same company."}
                )

        if self.warehouse_id:
            if self.warehouse.company_id != self.company_id:
                raise ValidationError(
                    {"warehouse": "Warehouse must belong to the same company."}
                )

        if self.production_bin_id and self.warehouse_id:
            if self.production_bin.warehouse_id != self.warehouse_id:
                raise ValidationError(
                    {"production_bin": "Production bin must belong to the selected warehouse."}
                )

    def __str__(self):
        return self.document_number or f"MI-DRAFT-{self.pk}"


class MaterialIssueLine(BaseModel):
    """
    Individual material consumption line.

    receipt_layer and lot are populated from the actual inventory allocation
    used during posting, preserving FIFO/lot traceability.
    """

    material_issue = models.ForeignKey(
        MaterialIssue,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    bom_line = models.ForeignKey(
        BOMLine,
        on_delete=models.PROTECT,
        related_name="material_issue_lines",
    )
    item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.PROTECT,
        related_name="production_material_issue_lines",
    )
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="production_material_issue_lines",
    )
    receipt_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="production_material_issue_lines",
    )
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
    )
    uom = models.ForeignKey(
        "inventory.UnitOfMeasure",
        on_delete=models.PROTECT,
        related_name="production_material_issue_lines",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="ck_prod_miline_qty_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["material_issue", "item"],
                name="ix_prod_miline_issue_item",
            ),
            models.Index(
                fields=["lot"],
                name="ix_prod_miline_lot",
            ),
            models.Index(
                fields=["receipt_layer"],
                name="ix_prod_miline_layer",
            ),
        ]

    def clean(self):
        if self.material_issue_id and self.item_id:
            if self.item.company_id != self.material_issue.company_id:
                raise ValidationError(
                    {"item": "Material item must belong to the same company."}
                )

        if self.bom_line_id and self.item_id:
            if self.bom_line.component_item_id != self.item_id:
                raise ValidationError(
                    {"item": "Material item must match the BOM component."}
                )

        if self.material_issue_id and self.bom_line_id:
            if (
                self.bom_line.bom_version_id
                != self.material_issue.production_order.bom_version_id
            ):
                raise ValidationError(
                    {"bom_line": "BOM line must belong to the production order BOM version."}
                )

        if self.lot_id and self.item_id:
            if self.lot.item_id != self.item_id:
                raise ValidationError(
                    {"lot": "Material lot must belong to the selected item."}
                )

        if self.receipt_layer_id and self.item_id:
            if self.receipt_layer.item_id != self.item_id:
                raise ValidationError(
                    {"receipt_layer": "Receipt layer must belong to the selected item."}
                )


class ProductionOutput(DocumentModel):
    """
    Typed finished/semi-finished production output transaction.

    Posting creates the actual inventory lot/layer and stock ledger entry
    through the production service.
    """

    DOCUMENT_PREFIX = "FG"

    company = models.ForeignKey(
        "organization.Company",
        on_delete=models.PROTECT,
        related_name="production_outputs",
    )
    production_order = models.ForeignKey(
        ProductionOrder,
        on_delete=models.PROTECT,
        related_name="outputs",
    )
    warehouse = models.ForeignKey(
        "warehouse.Warehouse",
        on_delete=models.PROTECT,
        related_name="production_outputs",
    )
    output_bin = models.ForeignKey(
        "warehouse.Bin",
        on_delete=models.PROTECT,
        related_name="production_outputs",
    )
    output_date = models.DateField()
    posted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=ProductionDocumentStatus.choices,
        default=ProductionDocumentStatus.DRAFT,
        db_index=True,
    )
    notes = models.TextField(blank=True)

    class Meta(DocumentModel.Meta):
        indexes = [
            models.Index(
                fields=["company", "status"],
                name="ix_prod_output_company_status",
            ),
            models.Index(
                fields=["company", "production_order"],
                name="ix_prod_output_company_order",
            ),
        ]

    def clean(self):
        if self.production_order_id:
            if self.company_id != self.production_order.company_id:
                raise ValidationError(
                    {"production_order": "Production order must belong to the same company."}
                )

        if self.warehouse_id:
            if self.warehouse.company_id != self.company_id:
                raise ValidationError(
                    {"warehouse": "Warehouse must belong to the same company."}
                )

        if self.output_bin_id and self.warehouse_id:
            if self.output_bin.warehouse_id != self.warehouse_id:
                raise ValidationError(
                    {"output_bin": "Output bin must belong to the selected warehouse."}
                )

    def __str__(self):
        return self.document_number or f"FG-DRAFT-{self.pk}"


class ProductionOutputLine(BaseModel):
    """
    Finished/semi-finished quantity produced by a production output document.

    The lot is normally assigned during posting after validation; therefore
    it is nullable while the document is in DRAFT state.
    """

    production_output = models.ForeignKey(
        ProductionOutput,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.PROTECT,
        related_name="production_output_lines",
    )
    lot = models.ForeignKey(
        "inventory.InventoryLot",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="production_output_lines",
    )
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
    )
    uom = models.ForeignKey(
        "inventory.UnitOfMeasure",
        on_delete=models.PROTECT,
        related_name="production_output_lines",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="ck_prod_outputline_qty_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["production_output", "item"],
                name="ix_prod_outline_output_item",
            ),
            models.Index(
                fields=["lot"],
                name="ix_prod_outline_lot",
            ),
        ]

    def clean(self):
        if self.production_output_id and self.item_id:
            production_order = self.production_output.production_order

            if self.item.company_id != production_order.company_id:
                raise ValidationError(
                    {"item": "Output item must belong to the same company."}
                )

            if self.item_id != production_order.output_item_id:
                raise ValidationError(
                    {"item": "Output item must match the production order output item."}
                )

        if self.lot_id and self.item_id:
            if self.lot.item_id != self.item_id:
                raise ValidationError(
                    {"lot": "Output lot must belong to the selected item."}
                )


class ProductionLotTraceability(BaseModel):
    """
    Genealogy link between consumed material lots and a produced lot.

    This is a typed traceability record rather than JSON so that production
    genealogy can be queried reliably.
    """

    company = models.ForeignKey(
        "organization.Company",
        on_delete=models.PROTECT,
        related_name="production_lot_traceability",
    )
    production_order = models.ForeignKey(
        ProductionOrder,
        on_delete=models.PROTECT,
        related_name="lot_traceability",
    )
    material_issue_line = models.ForeignKey(
        MaterialIssueLine,
        on_delete=models.PROTECT,
        related_name="lot_traceability",
    )
    consumed_lot = models.ForeignKey(
        "inventory.InventoryLot",
        on_delete=models.PROTECT,
        related_name="production_consumption_traceability",
    )
    consumed_layer = models.ForeignKey(
        "inventory.InventoryReceiptLayer",
        on_delete=models.PROTECT,
        related_name="production_consumption_traceability",
    )
    output_line = models.ForeignKey(
        ProductionOutputLine,
        on_delete=models.PROTECT,
        related_name="material_traceability",
    )
    output_lot = models.ForeignKey(
        "inventory.InventoryLot",
        on_delete=models.PROTECT,
        related_name="production_output_traceability",
    )
    quantity_consumed = models.DecimalField(
        max_digits=18,
        decimal_places=6,
    )
    uom = models.ForeignKey(
        "inventory.UnitOfMeasure",
        on_delete=models.PROTECT,
        related_name="production_traceability",
    )

    class Meta(BaseModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_consumed__gt=0),
                name="ck_prod_trace_qty_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["company", "production_order"],
                name="ix_prod_trace_company_order",
            ),
            models.Index(
                fields=["consumed_lot"],
                name="ix_prod_trace_consumed_lot",
            ),
            models.Index(
                fields=["output_lot"],
                name="ix_prod_trace_output_lot",
            ),
        ]

    def clean(self):
        if self.production_order_id:
            if self.company_id != self.production_order.company_id:
                raise ValidationError(
                    {"company": "Traceability company must match the production order."}
                )

        if self.material_issue_line_id:
            if (
                self.material_issue_line.material_issue.production_order_id
                != self.production_order_id
            ):
                raise ValidationError(
                    {
                        "material_issue_line": (
                            "Material issue line must belong to the production order."
                        )
                    }
                )

        if self.output_line_id:
            if (
                self.output_line.production_output.production_order_id
                != self.production_order_id
            ):
                raise ValidationError(
                    {
                        "output_line": (
                            "Output line must belong to the production order."
                        )
                    }
                )

        if self.consumed_lot_id and self.consumed_layer_id:
            if self.consumed_layer.lot_id != self.consumed_lot_id:
                raise ValidationError(
                    {
                        "consumed_layer": (
                            "Consumed receipt layer must belong to the consumed lot."
                        )
                    }
                )

        if self.output_lot_id and self.output_line_id:
            if self.output_line.lot_id and self.output_line.lot_id != self.output_lot_id:
                raise ValidationError(
                    {
                        "output_lot": (
                            "Output lot must match the output line lot."
                        )
                    }
                )