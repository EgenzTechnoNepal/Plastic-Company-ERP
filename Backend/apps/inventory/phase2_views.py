"""Phase 2 typed APIs — inventory ledger, FIFO, reservations, balances, landed post."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.inventory.landed_post import adjust_landed_cost, post_landed_cost
from apps.inventory.ledger import StockLedgerEntry, StockReservation, StockReservationAllocation
from apps.inventory.models import Item, LandedCostDocument, UnitOfMeasure
from apps.inventory.serializers import LandedCostDocumentSerializer
from apps.inventory.stock_services import (
    compute_balances,
    fifo_issue,
    release_reservation,
    reserve_stock,
)
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.organization.models import Company


class StockLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = StockLedgerEntry
        fields = [
            "id",
            "company",
            "item",
            "lot",
            "receipt_layer",
            "warehouse",
            "bin",
            "txn_type",
            "quantity_in",
            "quantity_out",
            "uom",
            "unit_cost",
            "total_cost",
            "reference_type",
            "reference_id",
            "reason",
            "occurred_at",
            "is_state_event",
            "created_at",
            "created_by",
        ]
        read_only_fields = fields


class StockReservationAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockReservationAllocation
        fields = ["id", "receipt_layer", "lot", "quantity"]
        read_only_fields = fields


class StockReservationSerializer(serializers.ModelSerializer):
    allocations = StockReservationAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = StockReservation
        fields = [
            "id",
            "company",
            "item",
            "lot",
            "receipt_layer",
            "warehouse",
            "quantity",
            "uom",
            "reference_type",
            "reference_id",
            "status",
            "notes",
            "allocations",
            "created_at",
        ]
        read_only_fields = ["id", "status", "allocations", "created_at"]


class FifoIssueSerializer(serializers.Serializer):
    company = serializers.UUIDField()
    item = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=18, decimal_places=6)
    uom = serializers.UUIDField()
    warehouse = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class BalanceQuerySerializer(serializers.Serializer):
    company = serializers.UUIDField()
    item = serializers.UUIDField()
    warehouse = serializers.UUIDField(required=False, allow_null=True)


class StockLedgerViewSet(CompanyScopedMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "inventory"
    company_field = "company"
    queryset = StockLedgerEntry.objects.select_related("item", "lot", "uom").all()
    serializer_class = StockLedgerEntrySerializer
    filterset_fields = ["company", "item", "lot", "txn_type", "warehouse"]
    search_fields = ["reference_type", "reason"]
    http_method_names = ["get", "head", "options"]


class InventoryBalanceViewSet(viewsets.ViewSet):
    permission_classes = [HasModulePermission]
    module_code = "inventory"

    def list(self, request):
        ser = BalanceQuerySerializer(data=request.query_params)
        ser.is_valid(raise_exception=True)
        company = Company.objects.get(pk=ser.validated_data["company"])
        assert_company_allowed(request.user, company.id)
        item = Item.objects.get(pk=ser.validated_data["item"], company=company)
        warehouse = None
        if ser.validated_data.get("warehouse"):
            from apps.warehouse.models import Warehouse

            warehouse = Warehouse.objects.get(pk=ser.validated_data["warehouse"], company=company)
        return envelope(compute_balances(company=company, item=item, warehouse=warehouse))


class FifoIssueViewSet(viewsets.ViewSet):
    permission_classes = [HasModulePermission]
    module_code = "inventory"

    def create(self, request):
        ser = FifoIssueSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        company = Company.objects.get(pk=data["company"])
        assert_company_allowed(request.user, company.id)
        item = Item.objects.get(pk=data["item"], company=company)
        uom = UnitOfMeasure.objects.get(pk=data["uom"])
        warehouse = None
        if data.get("warehouse"):
            from apps.warehouse.models import Warehouse

            warehouse = Warehouse.objects.get(pk=data["warehouse"], company=company)
        entries = fifo_issue(
            company=company,
            item=item,
            quantity=data["quantity"],
            uom=uom,
            user=request.user,
            warehouse=warehouse,
            reason=data.get("reason") or "",
        )
        return Response(
            {"data": StockLedgerEntrySerializer(entries, many=True).data},
            status=status.HTTP_201_CREATED,
        )


class StockReservationViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "inventory"
    company_field = "company"
    queryset = StockReservation.objects.select_related("item", "lot").all()
    serializer_class = StockReservationSerializer
    filterset_fields = ["company", "item", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        reservation = reserve_stock(
            company=data["company"],
            item=data["item"],
            quantity=data["quantity"],
            uom=data["uom"],
            user=request.user,
            lot=data.get("lot"),
            receipt_layer=data.get("receipt_layer"),
            warehouse=data.get("warehouse"),
            reference_type=data.get("reference_type") or "",
            reference_id=data.get("reference_id"),
            notes=data.get("notes") or "",
        )
        return Response(StockReservationSerializer(reservation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="release")
    def release(self, request, pk=None):
        reservation = self.get_object()
        updated = release_reservation(reservation=reservation, user=request.user)
        return envelope(StockReservationSerializer(updated).data)


class LandedCostPostViewSet(CompanyScopedMixin, viewsets.GenericViewSet):
    permission_classes = [HasModulePermission]
    module_code = "inventory"
    company_field = "company"
    queryset = LandedCostDocument.objects.all()
    serializer_class = LandedCostDocumentSerializer

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        document = self.get_object()
        result = post_landed_cost(document=document, user=request.user)
        return envelope(result)

    @action(detail=True, methods=["post"], url_path="adjust")
    def adjust_document(self, request, pk=None):
        document = self.get_object()
        result = adjust_landed_cost(document=document, user=request.user)
        return envelope(result)
