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
from apps.procurement.lc_services import lc_inbound_status_for_po


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


def _po_from_gate_obj(obj: GateEntry):
    if obj.purchase_order_id:
        return obj.purchase_order
    if obj.shipment_id and getattr(obj.shipment, "purchase_order_id", None):
        return obj.shipment.purchase_order
    return None


def _po_from_grn_obj(obj: GoodsReceiptNote):
    gate = getattr(obj, "gate_entry", None)
    if gate is not None:
        po = _po_from_gate_obj(gate)
        if po is not None:
            return po
    if obj.shipment_id and getattr(obj.shipment, "purchase_order_id", None):
        return obj.shipment.purchase_order
    line = obj.lines.select_related("purchase_order_line__purchase_order").first()
    if line and line.purchase_order_line_id:
        return line.purchase_order_line.purchase_order
    return None


class GateEntrySerializer(serializers.ModelSerializer):
    lc_gate_allowed = serializers.SerializerMethodField()
    lc_gate_message = serializers.SerializerMethodField()
    lc_id = serializers.SerializerMethodField()
    lc_document_number = serializers.SerializerMethodField()
    lc_status = serializers.SerializerMethodField()

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
            "lc_gate_allowed",
            "lc_gate_message",
            "lc_id",
            "lc_document_number",
            "lc_status",
        ]
        read_only_fields = [
            "id",
            "status",
            "created_at",
            "updated_at",
            "lc_gate_allowed",
            "lc_gate_message",
            "lc_id",
            "lc_document_number",
            "lc_status",
        ]

    def _lc_status(self, obj: GateEntry) -> dict:
        cache = getattr(self, "_lc_status_cache", None)
        if cache is None:
            cache = {}
            self._lc_status_cache = cache
        key = str(obj.pk)
        if key not in cache:
            cache[key] = lc_inbound_status_for_po(_po_from_gate_obj(obj))
        return cache[key]

    def get_lc_gate_allowed(self, obj: GateEntry) -> bool:
        return bool(self._lc_status(obj)["lc_gate_allowed"])

    def get_lc_gate_message(self, obj: GateEntry) -> str:
        return str(self._lc_status(obj).get("lc_gate_message") or "")

    def get_lc_id(self, obj: GateEntry):
        return self._lc_status(obj).get("lc_id")

    def get_lc_document_number(self, obj: GateEntry):
        return self._lc_status(obj).get("lc_document_number")

    def get_lc_status(self, obj: GateEntry):
        return self._lc_status(obj).get("lc_status")


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
    lc_gate_allowed = serializers.SerializerMethodField()
    lc_gate_message = serializers.SerializerMethodField()
    lc_id = serializers.SerializerMethodField()
    lc_document_number = serializers.SerializerMethodField()
    lc_status = serializers.SerializerMethodField()

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
            "lc_gate_allowed",
            "lc_gate_message",
            "lc_id",
            "lc_document_number",
            "lc_status",
        ]
        read_only_fields = [
            "id",
            "status",
            "posted_at",
            "created_at",
            "lc_gate_allowed",
            "lc_gate_message",
            "lc_id",
            "lc_document_number",
            "lc_status",
        ]

    def _lc_status(self, obj: GoodsReceiptNote) -> dict:
        cache = getattr(self, "_lc_status_cache", None)
        if cache is None:
            cache = {}
            self._lc_status_cache = cache
        key = str(obj.pk)
        if key not in cache:
            cache[key] = lc_inbound_status_for_po(_po_from_grn_obj(obj))
        return cache[key]

    def get_lc_gate_allowed(self, obj: GoodsReceiptNote) -> bool:
        return bool(self._lc_status(obj)["lc_gate_allowed"])

    def get_lc_gate_message(self, obj: GoodsReceiptNote) -> str:
        return str(self._lc_status(obj).get("lc_gate_message") or "")

    def get_lc_id(self, obj: GoodsReceiptNote):
        return self._lc_status(obj).get("lc_id")

    def get_lc_document_number(self, obj: GoodsReceiptNote):
        return self._lc_status(obj).get("lc_document_number")

    def get_lc_status(self, obj: GoodsReceiptNote):
        return self._lc_status(obj).get("lc_status")

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
    queryset = GateEntry.objects.select_related(
        "supplier", "shipment", "shipment__purchase_order", "purchase_order"
    ).all()
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

    @action(detail=False, methods=["post"], url_path="record")
    def record(self, request):
        from apps.procurement.commercial import PurchaseOrder
        from apps.procurement.inbound_journey import record_gate_entry, scoped_get

        po = scoped_get(
            PurchaseOrder.objects.select_related("supplier", "company"),
            request.user,
            request.data.get("purchase_order"),
            label="Purchase order",
        )
        gate = record_gate_entry(
            purchase_order=po,
            vehicle_number=request.data.get("vehicle_number") or "",
            driver_name=request.data.get("driver_name") or "",
            remarks=request.data.get("remarks") or "",
            user=request.user,
        )
        response = envelope(GateEntrySerializer(gate).data)
        response.status_code = status.HTTP_201_CREATED
        return response

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        from apps.procurement.inbound_journey import receive_against_gate

        grn = receive_against_gate(
            gate=self.get_object(), lines=request.data.get("lines") or [], user=request.user
        )
        response = envelope(GoodsReceiptNoteSerializer(grn).data)
        response.status_code = status.HTTP_201_CREATED
        return response


class GoodsReceiptViewSet(InboundMasterViewSet):
    queryset = GoodsReceiptNote.objects.prefetch_related("lines").select_related(
        "supplier",
        "warehouse",
        "gate_entry",
        "gate_entry__purchase_order",
        "gate_entry__shipment",
        "gate_entry__shipment__purchase_order",
        "shipment",
        "shipment__purchase_order",
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
