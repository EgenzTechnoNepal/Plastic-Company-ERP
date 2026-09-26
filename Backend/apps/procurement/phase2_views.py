"""Phase 2 inbound APIs: shipment, gate entry, GRN."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin
from apps.procurement.inbound import (
    GateEntry,
    GoodsReceiptLine,
    GoodsReceiptNote,
    ImportShipment,
)
from apps.procurement.inbound_services import cancel_gate_entry, post_grn, submit_gate_entry


class ImportShipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportShipment
        fields = [
            "id",
            "company",
            "shipment_number",
            "supplier",
            "incoterm",
            "named_place",
            "purchase_reference",
            "purchase_order",
            "etd",
            "eta",
            "notes",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class GateEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = GateEntry
        fields = [
            "id",
            "company",
            "gate_entry_number",
            "entry_at",
            "supplier",
            "shipment",
            "purchase_reference",
            "purchase_order",
            "vehicle_number",
            "driver_name",
            "material_reference",
            "quantity_note",
            "document_references",
            "remarks",
            "status",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "grn",
            "item",
            "uom",
            "received_quantity",
            "accepted_quantity",
            "rejected_quantity",
            "purchase_unit_cost",
            "supplier_lot_number",
            "lot_number",
            "manufacturing_date",
            "expiry_date",
            "lot",
            "receipt_layer",
            "purchase_order_line",
            "line_notes",
        ]
        read_only_fields = ["id", "lot", "receipt_layer"]


class GoodsReceiptNoteSerializer(serializers.ModelSerializer):
    lines = GoodsReceiptLineSerializer(many=True, required=False)

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "id",
            "company",
            "grn_number",
            "gate_entry",
            "supplier",
            "shipment",
            "warehouse",
            "receiving_bin",
            "purchase_reference",
            "received_at",
            "currency",
            "status",
            "posted_at",
            "notes",
            "lines",
            "created_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "created_at"]

    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        grn = GoodsReceiptNote.objects.create(**validated_data)
        for line in lines_data:
            GoodsReceiptLine.objects.create(grn=grn, **line)
        return grn


class InboundMasterViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "procurement"
    company_field = "company"

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        self._assert_validated_company_access(serializer.validated_data, instance=serializer.instance)
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])


class ImportShipmentViewSet(InboundMasterViewSet):
    queryset = ImportShipment.objects.select_related("supplier", "incoterm").all()
    serializer_class = ImportShipmentSerializer
    search_fields = ["shipment_number", "purchase_reference"]
    filterset_fields = ["company", "supplier", "is_active"]


class GateEntryViewSet(InboundMasterViewSet):
    queryset = GateEntry.objects.select_related("supplier", "shipment").all()
    serializer_class = GateEntrySerializer
    search_fields = ["gate_entry_number", "vehicle_number", "driver_name"]
    filterset_fields = ["company", "supplier", "status"]

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        gate = self.get_object()
        updated = submit_gate_entry(gate=gate, user=request.user)
        return envelope(GateEntrySerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        gate = self.get_object()
        updated = cancel_gate_entry(gate=gate, user=request.user)
        return envelope(GateEntrySerializer(updated).data)


class GoodsReceiptViewSet(InboundMasterViewSet):
    queryset = GoodsReceiptNote.objects.prefetch_related("lines").select_related(
        "supplier", "warehouse", "gate_entry"
    ).all()
    serializer_class = GoodsReceiptNoteSerializer
    search_fields = ["grn_number", "purchase_reference"]
    filterset_fields = ["company", "supplier", "status", "warehouse"]

    @action(detail=True, methods=["post"], url_path="post")
    def post_grn_action(self, request, pk=None):
        grn = self.get_object()
        updated = post_grn(grn=grn, user=request.user)
        return envelope(GoodsReceiptNoteSerializer(updated).data)


class GoodsReceiptLineViewSet(InboundMasterViewSet):
    company_field = "grn__company"
    company_from_related = ("grn",)
    queryset = GoodsReceiptLine.objects.select_related("grn", "item", "uom").all()
    serializer_class = GoodsReceiptLineSerializer
    filterset_fields = ["grn", "item"]
