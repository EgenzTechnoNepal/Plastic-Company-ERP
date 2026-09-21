from rest_framework.routers import DefaultRouter

from apps.system import views

router = DefaultRouter()
router.register("settings", views.SystemSettingViewSet, basename="system-setting")
router.register("feature-flags", views.FeatureFlagViewSet, basename="feature-flag")
router.register("numbering-series", views.NumberingSeriesConfigViewSet, basename="numbering-series")

urlpatterns = router.urls
