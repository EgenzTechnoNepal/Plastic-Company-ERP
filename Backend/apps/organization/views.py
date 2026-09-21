from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.organization.models import (
    Branch,
    Company,
    CostCentre,
    Department,
    ExchangeRate,
    FiscalPeriod,
    FiscalYear,
    Project,
    ProfitCentre,
)
from apps.organization.serializers import (
    BranchSerializer,
    CompanySerializer,
    CostCentreSerializer,
    DepartmentSerializer,
    ExchangeRateSerializer,
    FiscalPeriodSerializer,
    FiscalYearSerializer,
    ProjectSerializer,
    ProfitCentreSerializer,
)


class OrganizationModuleViewSet(viewsets.ModelViewSet):
    """Shared base: every organization master is gated by the 'organization' module."""

    permission_classes = [HasModulePermission]
    module_code = "organization"
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]


class CompanyViewSet(OrganizationModuleViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    search_fields = ["name", "legal_name", "pan_vat_number"]


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
    queryset = FiscalPeriod.objects.select_related("fiscal_year").all()
    serializer_class = FiscalPeriodSerializer
    filterset_fields = ["fiscal_year", "status"]


class ExchangeRateViewSet(OrganizationModuleViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_fields = ["currency_code"]
    search_fields = ["currency_code"]
