from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.system import views
from apps.system.dashboard import DashboardSummaryView

router = DefaultRouter()
router.register("settings", views.SystemSettingViewSet, basename="system-setting")
router.register("feature-flags", views.FeatureFlagViewSet, basename="feature-flag")
router.register("numbering-series", views.NumberingSeriesConfigViewSet, basename="numbering-series")

urlpatterns = router.urls + [
    path("dashboard-summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
]
