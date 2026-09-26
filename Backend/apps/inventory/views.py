from rest_framework import viewsets
from rest_framework.decorators import action

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset
from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    ItemUom,
    LandedCostAllocation,
    LandedCostComponent,
    LandedCostDocument,
    Record,
    SupplierItemPrice,
    UnitOfMeasure,
    UomConversion,
)
from apps.inventory.serializers import (
    InventoryLotSerializer,
    InventoryReceiptLayerSerializer,
    ItemSerializer,
    ItemUomSerializer,
    LandedCostAllocationSerializer,
    LandedCostComponentSerializer,
    LandedCostDocumentSerializer,
    LotStatusTransitionSerializer,
    SupplierItemPriceSerializer,
    UnitOfMeasureSerializer,
    UomConversionSerializer,
)
from apps.inventory.services import convert_quantity, preview_landed_cost, transition_lot_status

ENTITIES = [
    ("products", "products"),
    ("batches", "batches"),
    ("stock_movements", "movements"),
    ("stock_adjustments", "adjustments"),
]
MODULE_CODE = "inventory"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class BatchViewSet(VIEWSETS["batches"]):
    @action(detail=True, methods=["get"])
    def genealogy(self, request, pk=None):
        obj = self.get_object()
        fields = obj.fields or {}
        return envelope(
            {
                "batch": self.get_serializer(obj).data,
                "work_order": fields.get("workOrder") or fields.get("wo"),
                "bom": fields.get("bom"),
                "source_lot": fields.get("rmBatch") or fields.get("sourceBatch"),
                "parents": obj.links or [],
            }
        )


VIEWSETS["batches"] = BatchViewSet


class InventoryMasterViewSet(viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    search_fields = ["code", "name"]
    ordering_fields = ["created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        # Soft-deactivate masters — never hard-delete with history risk
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])


class UnitOfMeasureViewSet(InventoryMasterViewSet):
    queryset = UnitOfMeasure.objects.all()
    serializer_class = UnitOfMeasureSerializer
    search_fields = ["code", "name", "symbol"]
    ordering_fields = ["code", "name", "created_at"]


class UomConversionViewSet(InventoryMasterViewSet):
    queryset = UomConversion.objects.select_related("from_uom", "to_uom").all()
    serializer_class = UomConversionSerializer
    filterset_fields = ["from_uom", "to_uom"]
    search_fields = ["from_uom__code", "to_uom__code"]

    @action(detail=False, methods=["post"], url_path="convert")
    def convert(self, request):
        from_id = request.data.get("from_uom")
        to_id = request.data.get("to_uom")
        quantity = request.data.get("quantity")
        from_uom = UnitOfMeasure.objects.get(pk=from_id)
        to_uom = UnitOfMeasure.objects.get(pk=to_id)
        result = convert_quantity(quantity, from_uom, to_uom)
        return envelope(
            {
                "from_uom": from_uom.code,
                "to_uom": to_uom.code,
                "quantity": str(quantity),
                "converted": str(result),
            }
        )


class ItemViewSet(InventoryMasterViewSet):
    queryset = Item.objects.select_related(
        "base_uom", "purchase_uom", "stock_uom", "preferred_supplier", "company"
    ).all()
    serializer_class = ItemSerializer
    filterset_fields = ["company", "item_type", "category", "is_active"]
    search_fields = ["sku", "name", "supplier_item_code"]
    ordering_fields = ["sku", "name", "created_at"]


class ItemUomViewSet(InventoryMasterViewSet):
    queryset = ItemUom.objects.select_related("item", "uom").all()
    serializer_class = ItemUomSerializer
    filterset_fields = ["item", "uom"]
    search_fields = ["item__sku", "uom__code"]


class SupplierItemPriceViewSet(InventoryMasterViewSet):
    queryset = SupplierItemPrice.objects.select_related("item", "supplier", "uom", "currency").all()
    serializer_class = SupplierItemPriceSerializer
    filterset_fields = ["item", "supplier", "is_active"]
    search_fields = ["item__sku", "supplier__code", "supplier_item_code"]


class InventoryLotViewSet(InventoryMasterViewSet):
    queryset = InventoryLot.objects.select_related("item", "supplier", "warehouse", "bin", "uom").all()
    serializer_class = InventoryLotSerializer
    filterset_fields = ["company", "item", "supplier", "status", "warehouse", "is_active"]
    search_fields = ["lot_number", "supplier_lot_number", "item__sku"]
    ordering_fields = ["lot_number", "received_date", "created_at"]

    def perform_create(self, serializer):
        data = serializer.validated_data
        if data.get("remaining_quantity") is None and data.get("initial_quantity") is not None:
            serializer.save(
                remaining_quantity=data["initial_quantity"],
                created_by=self.request.user,
                updated_by=self.request.user,
            )
        else:
            super().perform_create(serializer)

    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, pk=None):
        lot = self.get_object()
        ser = LotStatusTransitionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        updated = transition_lot_status(lot, ser.validated_data["status"], user=request.user)
        return envelope(InventoryLotSerializer(updated).data)


class InventoryReceiptLayerViewSet(InventoryMasterViewSet):
    queryset = InventoryReceiptLayer.objects.select_related("lot", "item").all()
    serializer_class = InventoryReceiptLayerSerializer
    filterset_fields = ["company", "item", "lot", "warehouse"]
    search_fields = ["lot__lot_number", "item__sku"]
    ordering_fields = ["receipt_sequence", "received_at", "created_at"]


class LandedCostDocumentViewSet(InventoryMasterViewSet):
    queryset = LandedCostDocument.objects.prefetch_related("components").select_related(
        "currency", "lot", "company"
    ).all()
    serializer_class = LandedCostDocumentSerializer
    filterset_fields = ["company", "status", "lot", "is_active"]
    search_fields = ["document_number", "reference"]

    def perform_create(self, serializer):
        data = serializer.validated_data
        qty = data.get("purchase_quantity") or 0
        unit = data.get("purchase_unit_cost") or 0
        from decimal import Decimal

        purchase_value = Decimal(str(qty)) * Decimal(str(unit))
        serializer.save(
            purchase_value=purchase_value,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    @action(detail=True, methods=["post"], url_path="preview")
    def preview(self, request, pk=None):
        document = self.get_object()
        result = preview_landed_cost(document)
        return envelope(result)


class LandedCostComponentViewSet(InventoryMasterViewSet):
    queryset = LandedCostComponent.objects.select_related("document", "currency", "supplier").all()
    serializer_class = LandedCostComponentSerializer
    filterset_fields = ["document", "category", "allocation_basis", "is_active"]
    search_fields = ["category", "source_document_number", "description"]


class LandedCostAllocationViewSet(InventoryMasterViewSet):
    queryset = LandedCostAllocation.objects.select_related("document", "component", "lot", "item").all()
    serializer_class = LandedCostAllocationSerializer
    filterset_fields = ["document", "component", "lot", "item", "allocation_basis"]
    search_fields = ["allocation_basis"]
