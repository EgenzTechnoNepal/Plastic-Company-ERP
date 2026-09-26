"""Phase 3 Slice A — typed SO, Dispatch, Sales Invoice APIs."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, company_pk
from apps.sales.commercial import (
    DispatchNote,
    DispatchNoteLine,
    SalesInvoice,
    SalesInvoiceLine,
    SalesOrder,
    SalesOrderLine,
)
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.invoice_services import add_invoice_line, create_sales_invoice, post_sales_invoice
from apps.sales.so_services import (
    add_so_line,
    cancel_sales_order,
    confirm_sales_order,
    create_sales_order,
    release_sales_order_reservations,
)


class SalesOrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesOrderLine
        fields = [
            "id",
            "line_no",
            "item",
            "uom",
            "warehouse",
            "ordered_quantity",
            "reserved_quantity",
            "dispatched_quantity",
            "invoiced_quantity",
            "unit_price",
            "discount_pct",
            "tax_pct",
            "notes",
        ]
        read_only_fields = [
            "id",
            "line_no",
            "reserved_quantity",
            "dispatched_quantity",
            "invoiced_quantity",
        ]


class SalesOrderSerializer(serializers.ModelSerializer):
    lines = SalesOrderLineSerializer(many=True, required=False)

    class Meta:
        model = SalesOrder
        fields = [
            "id",
            "company",
            "document_number",
            "customer",
            "currency",
            "warehouse",
            "requested_delivery_date",
            "payment_terms",
            "customer_reference",
            "status",
            "credit_warning",
            "notes",
            "confirmed_at",
            "lines",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "document_number",
            "status",
            "credit_warning",
            "confirmed_at",
            "created_at",
        ]


class SalesOrderViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "sales"
    company_field = "company"
    queryset = SalesOrder.objects.prefetch_related("lines").all()
    serializer_class = SalesOrderSerializer
    filterset_fields = ["company", "customer", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        lines = data.pop("lines", [])
        so = create_sales_order(
            company=data.pop("company"),
            customer=data.pop("customer"),
            user=request.user,
            **data,
        )
        for line in lines:
            add_so_line(
                sales_order=so,
                item=line["item"],
                uom=line["uom"],
                ordered_quantity=line["ordered_quantity"],
                user=request.user,
                warehouse=line.get("warehouse"),
                unit_price=line.get("unit_price", 0),
                discount_pct=line.get("discount_pct", 0),
                tax_pct=line.get("tax_pct", 0),
                notes=line.get("notes", ""),
            )
        return Response(
            SalesOrderSerializer(SalesOrder.objects.prefetch_related("lines").get(pk=so.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        return envelope(
            SalesOrderSerializer(confirm_sales_order(sales_order=self.get_object(), user=request.user)).data
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        return envelope(
            SalesOrderSerializer(cancel_sales_order(sales_order=self.get_object(), user=request.user)).data
        )

    @action(detail=True, methods=["post"], url_path="release-reservations")
    def release_reservations(self, request, pk=None):
        return envelope(
            SalesOrderSerializer(
                release_sales_order_reservations(sales_order=self.get_object(), user=request.user)
            ).data
        )


class DispatchNoteLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatchNoteLine
        fields = ["id", "sales_order_line", "quantity", "uom"]
        read_only_fields = ["id"]


class DispatchNoteSerializer(serializers.ModelSerializer):
    lines = DispatchNoteLineSerializer(many=True, required=False)

    class Meta:
        model = DispatchNote
        fields = [
            "id",
            "company",
            "document_number",
            "sales_order",
            "warehouse",
            "status",
            "posted_at",
            "notes",
            "lines",
            "created_at",
        ]
        read_only_fields = ["id", "document_number", "status", "posted_at", "created_at"]


class DispatchNoteViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "sales"
    company_field = "company"
    queryset = DispatchNote.objects.prefetch_related("lines").all()
    serializer_class = DispatchNoteSerializer
    filterset_fields = ["company", "sales_order", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        lines = data.pop("lines", [])
        so = data["sales_order"]
        dn = create_dispatch_note(
            sales_order=so,
            user=request.user,
            warehouse=data.get("warehouse"),
            notes=data.get("notes", ""),
        )
        for line in lines:
            add_dispatch_line(
                dispatch=dn,
                sales_order_line=line["sales_order_line"],
                quantity=line["quantity"],
                user=request.user,
            )
        return Response(
            DispatchNoteSerializer(DispatchNote.objects.prefetch_related("lines").get(pk=dn.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        return envelope(DispatchNoteSerializer(post_dispatch(dispatch=self.get_object(), user=request.user)).data)


class SalesInvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesInvoiceLine
        fields = [
            "id",
            "line_no",
            "sales_order_line",
            "item",
            "uom",
            "quantity",
            "unit_price",
            "tax_pct",
        ]
        read_only_fields = ["id", "line_no"]


class SalesInvoiceSerializer(serializers.ModelSerializer):
    lines = SalesInvoiceLineSerializer(many=True, required=False)

    class Meta:
        model = SalesInvoice
        fields = [
            "id",
            "company",
            "document_number",
            "customer",
            "sales_order",
            "dispatch_note",
            "currency",
            "status",
            "invoice_date",
            "due_date",
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
            "subtotal",
            "tax_total",
            "total",
            "posted_at",
            "created_at",
        ]


class SalesInvoiceViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "sales"
    company_field = "company"
    queryset = SalesInvoice.objects.prefetch_related("lines").all()
    serializer_class = SalesInvoiceSerializer
    filterset_fields = ["company", "customer", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        assert_company_allowed(request.user, company_pk(data["company"]))
        lines = data.pop("lines", [])
        inv = create_sales_invoice(
            company=data.pop("company"),
            customer=data.pop("customer"),
            user=request.user,
            **data,
        )
        for line in lines:
            add_invoice_line(
                invoice=inv,
                item=line["item"],
                uom=line["uom"],
                quantity=line["quantity"],
                unit_price=line.get("unit_price", 0),
                user=request.user,
                tax_pct=line.get("tax_pct", 0),
                sales_order_line=line.get("sales_order_line"),
            )
        return Response(
            SalesInvoiceSerializer(SalesInvoice.objects.prefetch_related("lines").get(pk=inv.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        return envelope(
            SalesInvoiceSerializer(post_sales_invoice(invoice=self.get_object(), user=request.user)).data
        )
