from django.contrib import admin

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

admin.site.register(Company)
admin.site.register(Branch)
admin.site.register(Department)
admin.site.register(CostCentre)
admin.site.register(ProfitCentre)
admin.site.register(Project)
admin.site.register(FiscalYear)
admin.site.register(FiscalPeriod)
admin.site.register(ExchangeRate)
