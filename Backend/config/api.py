"""Aggregates the API v1 router."""

from django.urls import include, path

urlpatterns = [
    path("auth/", include("apps.accounts.urls")),
    path("organization/", include("apps.organization.urls")),
    path("audit/", include("apps.audit.urls")),
    path("system/", include("apps.system.urls")),
    path("crm/", include("apps.crm.urls")),
    path("sales/", include("apps.sales.urls")),
    path("purchase/", include("apps.procurement.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("warehouse/", include("apps.warehouse.urls")),
    path("production/", include("apps.production.urls")),
    path("quality/", include("apps.quality.urls")),
    path("hr/", include("apps.hr.urls")),
    path("accounting/", include("apps.accounting.urls")),
    path("workflow/", include("apps.workflow.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("integrations/", include("apps.integrations.urls")),
    path("compliance/", include("apps.compliance.urls")),
    path("analytics/", include("apps.analytics.urls")),
    path("reports/", include("apps.reports.urls")),
    path("planning/", include("apps.planning.urls")),
    path("payroll/", include("apps.payroll.urls")),
    path("documents/", include("apps.documents.urls")),
]
