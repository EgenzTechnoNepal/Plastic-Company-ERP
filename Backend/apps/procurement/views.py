from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.core.record_api import make_record_viewset
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, resolve_company_id
from apps.procurement.models import Incoterm, Record, Supplier, SupplierDocument
from apps.procurement.serializers import (
    IncotermSerializer,
    SupplierDocumentSerializer,
    SupplierSerializer,
)

ENTITIES = [
    ("suppliers", "suppliers"),
    ("purchase_requisitions", "requisitions"),
    ("rfqs", "rfqs"),
    ("purchase_orders", "orders"),
    ("gate_entries", "gate-entries"),
    ("grns", "receipts"),
    ("purchase_bills", "bills"),
    ("purchase_returns", "returns"),
    ("debit_notes", "debit-notes"),
    ("vendor_payments", "payments"),
    ("ocr_bills", "ocr-bills"),
]
MODULE_CODE = "procurement"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class ProcurementMasterViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        self._assert_validated_company_access(serializer.validated_data, instance=serializer.instance)
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if self.company_field:
            assert_company_allowed(self.request.user, resolve_company_id(instance, self.company_field))
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])


class VendorViewSet(ProcurementMasterViewSet):
    """Typed Supplier master at /vendors/ — DomainRecord /suppliers/ remains for UI."""

    queryset = Supplier.objects.select_related("currency", "preferred_incoterm", "company").prefetch_related(
        "documents"
    ).all()
    serializer_class = SupplierSerializer
    filterset_fields = ["company", "country", "quality_status", "is_active"]
    search_fields = ["code", "legal_name", "trading_name", "email", "tax_id"]
    ordering_fields = ["code", "legal_name", "created_at"]


class IncotermViewSet(ProcurementMasterViewSet):
    company_field = None
    queryset = Incoterm.objects.all()
    serializer_class = IncotermSerializer
    search_fields = ["code", "name"]
    ordering_fields = ["code", "created_at"]
    filterset_fields = ["version", "is_active"]


class SupplierDocumentViewSet(ProcurementMasterViewSet):
    company_field = "supplier__company"
    company_from_related = ("supplier",)
    queryset = SupplierDocument.objects.select_related("supplier").all()
    serializer_class = SupplierDocumentSerializer
    filterset_fields = ["supplier", "document_type", "is_active"]
    search_fields = ["title", "reference_number"]
