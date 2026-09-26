from rest_framework import serializers

from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    ItemUom,
    LandedCostAllocation,
    LandedCostComponent,
    LandedCostDocument,
    SupplierItemPrice,
    UnitOfMeasure,
    UomConversion,
)
from apps.inventory.services import create_landed_component, validate_allocation_basis


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = [
            "id",
            "code",
            "name",
            "symbol",
            "is_base_weight",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class UomConversionSerializer(serializers.ModelSerializer):
    from_uom_code = serializers.CharField(source="from_uom.code", read_only=True)
    to_uom_code = serializers.CharField(source="to_uom.code", read_only=True)

    class Meta:
        model = UomConversion
        fields = [
            "id",
            "from_uom",
            "to_uom",
            "from_uom_code",
            "to_uom_code",
            "factor",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ItemUomSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemUom
        fields = [
            "id",
            "item",
            "uom",
            "factor_to_base",
            "is_purchase",
            "is_stock",
            "is_production",
            "is_active",
        ]
        read_only_fields = ["id"]


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = [
            "id",
            "company",
            "sku",
            "name",
            "description",
            "item_type",
            "category",
            "base_uom",
            "purchase_uom",
            "stock_uom",
            "production_uom",
            "weight_per_unit",
            "density",
            "price_basis",
            "preferred_supplier",
            "supplier_item_code",
            "batch_tracking",
            "expiry_tracking",
            "qc_required",
            "fifo_eligible",
            "reorder_level",
            "safety_stock",
            "minimum_order_quantity",
            "maximum_stock",
            "standard_cost",
            "valuation_method",
            "tax_category",
            "specifications",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]


class SupplierItemPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierItemPrice
        fields = [
            "id",
            "item",
            "supplier",
            "uom",
            "currency",
            "unit_price",
            "price_basis",
            "supplier_item_code",
            "effective_from",
            "effective_to",
            "minimum_order_quantity",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class InventoryLotSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryLot
        fields = [
            "id",
            "company",
            "lot_number",
            "item",
            "supplier",
            "supplier_lot_number",
            "manufacturing_date",
            "expiry_date",
            "received_date",
            "source_grn_reference",
            "purchase_reference",
            "genealogy_reference",
            "certificate_coa_reference",
            "warehouse",
            "bin",
            "status",
            "qc_status",
            "uom",
            "initial_quantity",
            "remaining_quantity",
            "currency",
            "purchase_unit_cost",
            "landed_unit_cost",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class LotStatusTransitionSerializer(serializers.Serializer):
    status = serializers.CharField()


class InventoryReceiptLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryReceiptLayer
        fields = [
            "id",
            "company",
            "lot",
            "item",
            "warehouse",
            "bin",
            "received_at",
            "receipt_sequence",
            "uom",
            "initial_quantity",
            "remaining_quantity",
            "reserved_quantity",
            "purchase_unit_cost",
            "landed_unit_cost",
            "currency",
            "qc_status",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LandedCostComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandedCostComponent
        fields = [
            "id",
            "document",
            "category",
            "description",
            "amount",
            "currency",
            "exchange_rate",
            "base_currency_amount",
            "supplier",
            "source_document",
            "source_document_number",
            "tax_amount",
            "cost_date",
            "allocation_basis",
            "status",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "base_currency_amount",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_allocation_basis(self, value):
        return validate_allocation_basis(value)

    def create(self, validated_data):
        document = validated_data.pop("document")
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        # Drop fields managed by the domain service / defaults
        validated_data.pop("base_currency_amount", None)
        validated_data.pop("status", None)
        validated_data.pop("is_active", None)
        validated_data.pop("created_by", None)
        validated_data.pop("updated_by", None)
        return create_landed_component(document, user=user, **validated_data)


class LandedCostAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandedCostAllocation
        fields = [
            "id",
            "document",
            "component",
            "lot",
            "item",
            "allocation_basis",
            "basis_value",
            "allocated_amount",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_allocation_basis(self, value):
        return validate_allocation_basis(value)


class LandedCostDocumentSerializer(serializers.ModelSerializer):
    components = LandedCostComponentSerializer(many=True, read_only=True)

    class Meta:
        model = LandedCostDocument
        fields = [
            "id",
            "company",
            "document_number",
            "reference",
            "lot",
            "currency",
            "status",
            "purchase_quantity",
            "purchase_unit_cost",
            "purchase_value",
            "notes",
            "components",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "status",
            "purchase_value",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
