"""CRM APIs — DomainRecord compatibility + typed Customer/Contact/Activity/Address."""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.core.pagination import envelope
from apps.core.record_api import make_record_viewset
from apps.crm.models import Contact, CrmActivity, Customer, PartyAddress, Record
from apps.crm.services import (
    complete_activity,
    create_activity,
    create_contact,
    create_customer,
    create_party_address,
    deactivate_customer,
    update_contact,
    update_customer,
)
from apps.organization.company_scope import (
    CompanyScopedMixin,
    assert_company_allowed,
    company_pk,
)

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
            "customer_type",
            "country",
            "address",
            "shipping_address",
            "contact_name",
            "email",
            "phone",
            "website",
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


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = [
            "id",
            "company",
            "customer",
            "supplier",
            "party_kind",
            "name",
            "designation",
            "email",
            "phone",
            "alternate_phone",
            "preferred_channel",
            "is_primary",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]


class PartyAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartyAddress
        fields = [
            "id",
            "company",
            "customer",
            "supplier",
            "address_type",
            "line1",
            "line2",
            "city",
            "state",
            "postal_code",
            "country",
            "is_primary",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CrmActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = CrmActivity
        fields = [
            "id",
            "company",
            "customer",
            "supplier",
            "contact",
            "activity_type",
            "subject",
            "description",
            "status",
            "due_at",
            "completed_at",
            "actor",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "completed_at",
            "actor",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class CustomerMasterViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    """Typed Customer authority at /crm/customer-masters/."""

    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = Customer.objects.select_related("company", "currency").all()
    serializer_class = CustomerSerializer
    filterset_fields = ["company", "is_active", "customer_type"]
    search_fields = ["code", "legal_name", "trading_name", "email", "phone", "tax_id"]
    ordering_fields = ["code", "legal_name", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options", "delete"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        company = data.pop("company")
        assert_company_allowed(request.user, company_pk(company))
        customer = create_customer(
            company=company,
            code=data.pop("code"),
            legal_name=data.pop("legal_name"),
            user=request.user,
            **data,
        )
        return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        data.pop("company", None)
        customer = update_customer(customer=instance, user=request.user, **data)
        return Response(CustomerSerializer(customer).data)

    def perform_destroy(self, instance):
        deactivate_customer(customer=instance, user=self.request.user)


class ContactViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = Contact.objects.select_related("company", "customer", "supplier").all()
    serializer_class = ContactSerializer
    filterset_fields = ["company", "customer", "supplier", "is_active", "party_kind"]
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options", "delete"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        company = data.pop("company")
        contact = create_contact(
            company=company,
            name=data.pop("name"),
            user=request.user,
            customer=data.pop("customer", None),
            supplier=data.pop("supplier", None),
            **data,
        )
        return Response(ContactSerializer(contact).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        data.pop("company", None)
        contact = update_contact(contact=instance, user=request.user, **data)
        return Response(ContactSerializer(contact).data)

    def perform_destroy(self, instance):
        assert_company_allowed(self.request.user, instance.company_id)
        update_contact(contact=instance, user=self.request.user, is_active=False)


class PartyAddressViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = PartyAddress.objects.select_related("company", "customer", "supplier").all()
    serializer_class = PartyAddressSerializer
    filterset_fields = ["company", "customer", "supplier", "address_type", "is_active"]
    http_method_names = ["get", "post", "patch", "head", "options", "delete"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        company = data.pop("company")
        addr = create_party_address(
            company=company,
            line1=data.pop("line1"),
            user=request.user,
            customer=data.pop("customer", None),
            supplier=data.pop("supplier", None),
            **data,
        )
        return Response(PartyAddressSerializer(addr).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        assert_company_allowed(self.request.user, instance.company_id)
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])


class CrmActivityViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = MODULE_CODE
    company_field = "company"
    queryset = CrmActivity.objects.select_related(
        "company", "customer", "supplier", "contact", "actor"
    ).all()
    serializer_class = CrmActivitySerializer
    filterset_fields = ["company", "customer", "supplier", "contact", "activity_type", "status"]
    search_fields = ["subject", "description"]
    ordering_fields = ["created_at", "due_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        company = data.pop("company")
        activity = create_activity(
            company=company,
            subject=data.pop("subject"),
            user=request.user,
            customer=data.pop("customer", None),
            supplier=data.pop("supplier", None),
            contact=data.pop("contact", None),
            **data,
        )
        return Response(CrmActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        return envelope(
            CrmActivitySerializer(
                complete_activity(activity=self.get_object(), user=request.user)
            ).data
        )
