"""Phase 3 Slice A — typed PO and Supplier Bill APIs."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.procurement.bill_services import (
    add_bill_line,
    create_supplier_bill,
    match_supplier_bill,
    post_supplier_bill,
)
from apps.procurement.commercial import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierBill,
    SupplierBillLine,
)
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    cancel_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
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
            "unit_price",
            "discount_pct",
            "tax_pct",
            "destination_warehouse",
            "notes",
        ]
        read_only_fields = ["id", "line_no", "received_quantity", "cancelled_quantity"]


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
            "approved_at",
            "lines",
            "created_at",
        ]
        read_only_fields = ["id", "document_number", "status", "approved_at", "created_at"]


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

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        return envelope(PurchaseOrderSerializer(submit_purchase_order(purchase_order=self.get_object(), user=request.user)).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        return envelope(PurchaseOrderSerializer(approve_purchase_order(purchase_order=self.get_object(), user=request.user)).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        return envelope(PurchaseOrderSerializer(cancel_purchase_order(purchase_order=self.get_object(), user=request.user)).data)


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
            "status",
            "match_status",
            "match_exceptions",
            "subtotal",
            "tax_total",
            "total",
            "notes",
            "posted_at",
            "lines",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "document_number",
            "status",
            "match_status",
            "match_exceptions",
            "subtotal",
            "tax_total",
            "total",
            "posted_at",
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

    @action(detail=True, methods=["post"], url_path="match")
    def match(self, request, pk=None):
        return envelope(SupplierBillSerializer(match_supplier_bill(bill=self.get_object(), user=request.user)).data)

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        return envelope(SupplierBillSerializer(post_supplier_bill(bill=self.get_object(), user=request.user)).data)
