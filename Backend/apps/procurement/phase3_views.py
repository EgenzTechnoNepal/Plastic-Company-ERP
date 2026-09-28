"""Phase 3 Slice A/B — typed PO and Supplier Bill APIs."""

from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.procurement.bill_services import (
    add_bill_line,
    approve_for_ap,
    create_supplier_bill,
    match_supplier_bill,
    post_supplier_bill,
    SupplierBillError,
)
from apps.procurement.commercial import (
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    SupplierBill,
    SupplierBillLine,
    SupplierBillStatus,
)
from apps.procurement.po_services import (
    add_po_line,
    amend_purchase_order,
    approve_purchase_order,
    cancel_po_line,
    cancel_purchase_order,
    close_purchase_order,
    create_purchase_order,
    mark_po_sent,
    submit_purchase_order,
)


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    remaining_receivable = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "line_no",
            "item",
            "uom",
            "ordered_quantity",
            "received_quantity",
            "cancelled_quantity",
            "remaining_receivable",
            "unit_price",
            "discount_pct",
            "tax_pct",
            "destination_warehouse",
            "notes",
        ]
        read_only_fields = ["id", "line_no", "received_quantity", "cancelled_quantity"]

    def get_remaining_receivable(self, obj):
        return str(obj.remaining_receivable)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True, required=False)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "company",
            "document_number",
            "supplier",
            "currency",
            "exchange_rate",
            "incoterm",
            "named_place",
            "destination_warehouse",
            "payment_terms",
            "expected_delivery_date",
            "status",
            "notes",
            "revision_no",
            "approved_at",
            "closed_at",
            "lines",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "document_number",
            "status",
            "revision_no",
            "approved_at",
            "closed_at",
            "created_at",
        ]


class PurchaseOrderViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "purchase"
    company_field = "company"
    queryset = PurchaseOrder.objects.prefetch_related("lines").all()
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ["company", "supplier", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        lines = data.pop("lines", [])
        po = create_purchase_order(
            company=data.pop("company"),
            supplier=data.pop("supplier"),
            user=request.user,
            **data,
        )
        for line in lines:
            add_po_line(
                purchase_order=po,
                item=line["item"],
                uom=line["uom"],
                ordered_quantity=line["ordered_quantity"],
                user=request.user,
                unit_price=line.get("unit_price", 0),
                discount_pct=line.get("discount_pct", 0),
                tax_pct=line.get("tax_pct", 0),
                destination_warehouse=line.get("destination_warehouse"),
                notes=line.get("notes", ""),
            )
        return Response(
            PurchaseOrderSerializer(PurchaseOrder.objects.prefetch_related("lines").get(pk=po.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        open_statuses = [
            PurchaseOrderStatus.APPROVED,
            PurchaseOrderStatus.SENT,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
        ]
        open_pos = qs.filter(status__in=open_statuses)
        lines = PurchaseOrderLine.objects.filter(purchase_order__in=open_pos)
        agg = lines.aggregate(
            ordered=Sum("ordered_quantity"),
            received=Sum("received_quantity"),
            cancelled=Sum("cancelled_quantity"),
        )
        ordered = agg["ordered"] or Decimal("0")
        received = agg["received"] or Decimal("0")
        cancelled = agg["cancelled"] or Decimal("0")
        return envelope(
            {
                "open_po_count": open_pos.count(),
                "open_qty": str(ordered - received - cancelled),
                "ordered_qty": str(ordered),
                "received_qty": str(received),
                "cancelled_qty": str(cancelled),
            }
        )

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        return envelope(
            PurchaseOrderSerializer(
                submit_purchase_order(purchase_order=self.get_object(), user=request.user)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        return envelope(
            PurchaseOrderSerializer(
                approve_purchase_order(purchase_order=self.get_object(), user=request.user)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        return envelope(
            PurchaseOrderSerializer(
                cancel_purchase_order(purchase_order=self.get_object(), user=request.user)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request, pk=None):
        return envelope(
            PurchaseOrderSerializer(
                mark_po_sent(purchase_order=self.get_object(), user=request.user)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        return envelope(
            PurchaseOrderSerializer(
                close_purchase_order(purchase_order=self.get_object(), user=request.user)
            ).data
        )

    @action(detail=True, methods=["post"], url_path="amend")
    def amend(self, request, pk=None):
        po = amend_purchase_order(
            purchase_order=self.get_object(),
            user=request.user,
            expected_delivery_date=request.data.get("expected_delivery_date"),
            notes=request.data.get("notes"),
            line_updates=request.data.get("line_updates") or request.data.get("lines"),
        )
        return envelope(
            PurchaseOrderSerializer(PurchaseOrder.objects.prefetch_related("lines").get(pk=po.pk)).data
        )

    @action(
        detail=True,
        methods=["post"],
        url_path=r"lines/(?P<line_id>[^/.]+)/cancel-remaining",
    )
    def cancel_line_remaining(self, request, pk=None, line_id=None):
        line = PurchaseOrderLine.objects.get(pk=line_id, purchase_order=self.get_object())
        qty = request.data.get("quantity")
        cancel_po_line(
            purchase_order_line=line,
            quantity=qty,
            user=request.user,
        )
        return envelope(
            PurchaseOrderSerializer(
                PurchaseOrder.objects.prefetch_related("lines").get(pk=pk)
            ).data
        )


class SupplierBillLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierBillLine
        fields = [
            "id",
            "line_no",
            "item",
            "uom",
            "quantity",
            "unit_price",
            "tax_pct",
            "purchase_order_line",
            "grn_line",
        ]
        read_only_fields = ["id", "line_no"]


class SupplierBillSerializer(serializers.ModelSerializer):
    lines = SupplierBillLineSerializer(many=True, required=False)

    class Meta:
        model = SupplierBill
        fields = [
            "id",
            "company",
            "document_number",
            "supplier",
            "supplier_invoice_number",
            "invoice_date",
            "due_date",
            "purchase_order",
            "grn",
            "currency",
            "exchange_rate",
            "discount_pct",
            "discount_amount",
            "status",
            "match_status",
            "match_exceptions",
            "commercials_frozen",
            "subtotal",
            "tax_total",
            "total",
            "notes",
            "posted_at",
            "approved_for_ap_at",
            "lines",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "document_number",
            "status",
            "match_status",
            "match_exceptions",
            "commercials_frozen",
            "subtotal",
            "tax_total",
            "total",
            "posted_at",
            "approved_for_ap_at",
            "created_at",
        ]


class SupplierBillViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "purchase"
    company_field = "company"
    queryset = SupplierBill.objects.prefetch_related("lines").all()
    serializer_class = SupplierBillSerializer
    filterset_fields = ["company", "supplier", "status", "match_status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def _assert_editable(self, bill: SupplierBill) -> None:
        if bill.commercials_frozen or bill.status in {
            SupplierBillStatus.APPROVED_FOR_AP,
            SupplierBillStatus.POSTED,
            SupplierBillStatus.CANCELLED,
        }:
            raise SupplierBillError(
                "Cannot edit frozen/approved/posted bill.",
                code="BILL_FROZEN",
            )

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        lines = data.pop("lines", [])
        bill = create_supplier_bill(
            company=data.pop("company"),
            supplier=data.pop("supplier"),
            supplier_invoice_number=data.pop("supplier_invoice_number"),
            user=request.user,
            **data,
        )
        for line in lines:
            add_bill_line(
                bill=bill,
                item=line["item"],
                uom=line["uom"],
                quantity=line["quantity"],
                unit_price=line.get("unit_price", 0),
                user=request.user,
                tax_pct=line.get("tax_pct", 0),
                purchase_order_line=line.get("purchase_order_line"),
                grn_line=line.get("grn_line"),
            )
        return Response(
            SupplierBillSerializer(SupplierBill.objects.prefetch_related("lines").get(pk=bill.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        bill = self.get_object()
        self._assert_editable(bill)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="match")
    def match(self, request, pk=None):
        return envelope(
            SupplierBillSerializer(match_supplier_bill(bill=self.get_object(), user=request.user)).data
        )

    @action(detail=True, methods=["post"], url_path="approve-for-ap")
    def approve_for_ap_action(self, request, pk=None):
        return envelope(
            SupplierBillSerializer(approve_for_ap(bill=self.get_object(), user=request.user)).data
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        return envelope(
            SupplierBillSerializer(post_supplier_bill(bill=self.get_object(), user=request.user)).data
        )
