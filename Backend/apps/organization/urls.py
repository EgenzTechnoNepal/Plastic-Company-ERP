from rest_framework.routers import DefaultRouter

from apps.organization import views

router = DefaultRouter()
router.register("companies", views.CompanyViewSet, basename="company")
router.register("branches", views.BranchViewSet, basename="branch")
router.register("departments", views.DepartmentViewSet, basename="department")
router.register("cost-centres", views.CostCentreViewSet, basename="cost-centre")
router.register("profit-centres", views.ProfitCentreViewSet, basename="profit-centre")
router.register("projects", views.ProjectViewSet, basename="project")
router.register("fiscal-years", views.FiscalYearViewSet, basename="fiscal-year")
router.register("fiscal-periods", views.FiscalPeriodViewSet, basename="fiscal-period")
router.register("exchange-rates", views.ExchangeRateViewSet, basename="exchange-rate")

urlpatterns = router.urls
