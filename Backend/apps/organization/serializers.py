from rest_framework import serializers

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


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["id", "name", "legal_name", "pan_vat_number", "address", "base_currency", "logo", "is_active"]


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "company", "code", "name", "address", "is_head_office", "is_active"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "company", "code", "name", "parent", "is_active"]


class CostCentreSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCentre
        fields = ["id", "company", "code", "name", "is_active"]


class ProfitCentreSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfitCentre
        fields = ["id", "company", "code", "name", "is_active"]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "company", "code", "name", "start_date", "end_date", "is_active"]


class FiscalYearSerializer(serializers.ModelSerializer):
    start_date_bs = serializers.ReadOnlyField()
    end_date_bs = serializers.ReadOnlyField()

    class Meta:
        model = FiscalYear
        fields = ["id", "company", "code", "start_date", "end_date", "start_date_bs", "end_date_bs", "status"]


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = ["id", "fiscal_year", "code", "month_number", "start_date", "end_date", "status"]


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "currency_code", "rate_to_base", "as_of_date"]
