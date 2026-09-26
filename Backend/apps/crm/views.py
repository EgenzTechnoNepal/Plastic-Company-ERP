from rest_framework import serializers, viewsets

from apps.accounts.permissions import HasModulePermission
from apps.core.record_api import make_record_viewset
from apps.crm.models import Customer, Record
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, resolve_company_id

ENTITIES = [
    ("customers", "customers"),
    ("contacts", "contacts"),
    ("leads", "leads"),
    ("opportunities", "opportunities"),
    ("activities", "activities"),
    ("dealers", "dealers"),
    ("territories", "territories"),
    ("tickets", "tickets"),
    ("quotations", "quotations"),
]
MODULE_CODE = "crm"

VIEWSETS = {
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id",
            "company",
            "code",
            "legal_name",
            "trading_name",
            "country",
            "address",
            "contact_name",
            "email",
            "phone",
            "tax_id",
            "currency",
            "payment_terms",
            "credit_limit",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]


class CustomerMasterViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = Customer.objects.select_related("company", "currency").all()
    serializer_class = CustomerSerializer
    filterset_fields = ["company", "is_active"]
    search_fields = ["code", "legal_name", "trading_name", "email"]
    ordering_fields = ["code", "legal_name", "created_at"]

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        self._assert_validated_company_access(serializer.validated_data, instance=serializer.instance)
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        assert_company_allowed(self.request.user, resolve_company_id(instance, self.company_field))
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])
