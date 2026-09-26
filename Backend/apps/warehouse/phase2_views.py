"""Phase 2 warehouse operation APIs."""

from rest_framework import serializers, viewsets
from rest_framework.decorators import action

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin
from apps.warehouse.operations import (
    CycleCountLine,
    CycleCountSession,
    PutawayOrder,
    StockAdjustment,
    StockTransfer,
)
from apps.warehouse.ops_services import (
    post_adjustment,
    post_cycle_count,
    post_putaway,
    post_transfer,
)


class PutawayOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = PutawayOrder
        fields = [
            "id",
            "company",
            "putaway_number",
            "lot",
            "from_bin",
            "to_warehouse",
            "to_bin",
            "quantity",
            "status",
            "posted_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "created_at"]


class StockTransferSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "company",
            "transfer_number",
            "item",
            "lot",
            "quantity",
            "uom",
            "from_warehouse",
            "from_bin",
            "to_warehouse",
            "to_bin",
            "status",
            "posted_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "created_at"]


class StockAdjustmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockAdjustment
        fields = [
            "id",
            "company",
            "adjustment_number",
            "item",
            "lot",
            "receipt_layer",
            "warehouse",
            "bin",
            "quantity_delta",
            "uom",
            "unit_cost",
            "reason",
            "reference",
            "status",
            "posted_at",
            "created_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "created_at"]


class CycleCountLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CycleCountLine
        fields = [
            "id",
            "session",
            "item",
            "lot",
            "receipt_layer",
            "expected_quantity",
            "counted_quantity",
            "variance",
        ]
        read_only_fields = ["id", "variance"]


class CycleCountSessionSerializer(serializers.ModelSerializer):
    lines = CycleCountLineSerializer(many=True, required=False)

    class Meta:
        model = CycleCountSession
        fields = [
            "id",
            "company",
            "session_number",
            "warehouse",
            "bin",
            "status",
            "posted_at",
            "notes",
            "adjustment",
            "lines",
            "created_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "adjustment", "created_at"]

    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        session = CycleCountSession.objects.create(**validated_data)
        for line in lines_data:
            CycleCountLine.objects.create(session=session, **line)
        return session


class WarehouseOpsViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "warehouse"
    company_field = "company"

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)


class PutawayViewSet(WarehouseOpsViewSet):
    queryset = PutawayOrder.objects.select_related("lot", "to_bin").all()
    serializer_class = PutawayOrderSerializer
    filterset_fields = ["company", "status", "lot"]

    @action(detail=True, methods=["post"], url_path="post")
    def post_action(self, request, pk=None):
        obj = self.get_object()
        updated = post_putaway(putaway=obj, user=request.user)
        return envelope(PutawayOrderSerializer(updated).data)


class StockTransferTypedViewSet(WarehouseOpsViewSet):
    queryset = StockTransfer.objects.select_related("lot", "item").all()
    serializer_class = StockTransferSerializer
    filterset_fields = ["company", "status", "item"]

    @action(detail=True, methods=["post"], url_path="post")
    def post_action(self, request, pk=None):
        obj = self.get_object()
        updated = post_transfer(transfer=obj, user=request.user)
        return envelope(StockTransferSerializer(updated).data)


class StockAdjustmentTypedViewSet(WarehouseOpsViewSet):
    queryset = StockAdjustment.objects.select_related("item", "lot").all()
    serializer_class = StockAdjustmentSerializer
    filterset_fields = ["company", "status", "item"]

    @action(detail=True, methods=["post"], url_path="post")
    def post_action(self, request, pk=None):
        obj = self.get_object()
        updated = post_adjustment(adjustment=obj, user=request.user)
        return envelope(StockAdjustmentSerializer(updated).data)


class CycleCountViewSet(WarehouseOpsViewSet):
    queryset = CycleCountSession.objects.prefetch_related("lines").all()
    serializer_class = CycleCountSessionSerializer
    filterset_fields = ["company", "status", "warehouse"]

    @action(detail=True, methods=["post"], url_path="post")
    def post_action(self, request, pk=None):
        obj = self.get_object()
        updated = post_cycle_count(session=obj, user=request.user)
        return envelope(CycleCountSessionSerializer(updated).data)
