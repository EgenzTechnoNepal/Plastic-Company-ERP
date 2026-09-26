from rest_framework.routers import DefaultRouter

from apps.sales import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

from apps.sales import phase3_views

router.register("sales-orders", phase3_views.SalesOrderViewSet, basename="sales-order-typed")
router.register("dispatch-notes", phase3_views.DispatchNoteViewSet, basename="dispatch-note")
router.register("sales-invoices", phase3_views.SalesInvoiceViewSet, basename="sales-invoice-typed")

urlpatterns = router.urls
