from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.organization.company_scope import CompanyScopedMixin, assert_company_allowed, resolve_company_id
from apps.organization.models import (
    Branch,
    Company,
    CostCentre,
    Currency,
    Department,
    ExchangeRate,
    FiscalPeriod,
    FiscalYear,
    Project,
    ProfitCentre,
    TaxCategory,
    TaxRate,
)
from apps.organization.serializers import (
    BranchSerializer,
    CompanySerializer,
    CostCentreSerializer,
    CurrencySerializer,
    DepartmentSerializer,
    ExchangeRateSerializer,
    FiscalPeriodSerializer,
    FiscalYearSerializer,
    ProjectSerializer,
    ProfitCentreSerializer,
    TaxCategorySerializer,
    TaxRateSerializer,
)


class OrganizationModuleViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    """Shared base: every organization master is gated by the 'organization' module."""

    permission_classes = [HasModulePermission]
    module_code = "organization"
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]
    company_field = "company"

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        serializer.save()

    def perform_update(self, serializer):
        self._assert_validated_company_access(serializer.validated_data, instance=serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        if self.company_field:
            assert_company_allowed(self.request.user, resolve_company_id(instance, self.company_field))
        return super(viewsets.ModelViewSet, self).perform_destroy(instance)


class CompanyViewSet(OrganizationModuleViewSet):
    """List/retrieve only companies the user is authorized for."""

    company_field = "id"
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    search_fields = ["name", "legal_name", "pan_vat_number"]

    def perform_create(self, serializer):
        # Creating a company is an org-admin action; still require module permission.
        # New company is not auto-granted to callers — assign UserRole/branch separately.
        serializer.save()

    def perform_update(self, serializer):
        assert_company_allowed(self.request.user, serializer.instance.pk)
        serializer.save()

    def perform_destroy(self, instance):
        assert_company_allowed(self.request.user, instance.pk)
        return super(viewsets.ModelViewSet, self).perform_destroy(instance)


class BranchViewSet(OrganizationModuleViewSet):
    queryset = Branch.objects.select_related("company").all()
    serializer_class = BranchSerializer
    filterset_fields = ["company", "is_head_office"]


class DepartmentViewSet(OrganizationModuleViewSet):
    queryset = Department.objects.select_related("company", "parent").all()
    serializer_class = DepartmentSerializer
    filterset_fields = ["company", "parent"]


class CostCentreViewSet(OrganizationModuleViewSet):
    queryset = CostCentre.objects.select_related("company").all()
    serializer_class = CostCentreSerializer
    filterset_fields = ["company"]


class ProfitCentreViewSet(OrganizationModuleViewSet):
    queryset = ProfitCentre.objects.select_related("company").all()
    serializer_class = ProfitCentreSerializer
    filterset_fields = ["company"]


class ProjectViewSet(OrganizationModuleViewSet):
    queryset = Project.objects.select_related("company").all()
    serializer_class = ProjectSerializer
    filterset_fields = ["company"]


class FiscalYearViewSet(OrganizationModuleViewSet):
    queryset = FiscalYear.objects.select_related("company").all()
    serializer_class = FiscalYearSerializer
    filterset_fields = ["company", "status"]


class FiscalPeriodViewSet(OrganizationModuleViewSet):
    company_field = "fiscal_year__company"
    company_from_related = ("fiscal_year",)
    queryset = FiscalPeriod.objects.select_related("fiscal_year").all()
    serializer_class = FiscalPeriodSerializer
    filterset_fields = ["fiscal_year", "status"]


class ExchangeRateViewSet(OrganizationModuleViewSet):
    company_field = None
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_fields = ["currency_code"]
    search_fields = ["currency_code"]


class CurrencyViewSet(OrganizationModuleViewSet):
    company_field = None
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]


class TaxCategoryViewSet(OrganizationModuleViewSet):
    queryset = TaxCategory.objects.select_related("company").all()
    serializer_class = TaxCategorySerializer
    filterset_fields = ["company", "is_active"]
    search_fields = ["code", "name"]


class TaxRateViewSet(OrganizationModuleViewSet):
    queryset = TaxRate.objects.select_related("company", "tax_category").all()
    serializer_class = TaxRateSerializer
    filterset_fields = ["company", "tax_category", "application", "is_active"]
    search_fields = ["name", "tax_category__code"]
