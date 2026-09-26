from rest_framework.routers import DefaultRouter

from apps.warehouse import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("facilities", views.FacilityViewSet, basename="facility")
router.register("zones", views.ZoneViewSet, basename="zone")
router.register("racks", views.RackViewSet, basename="rack")
router.register("storage-bins", views.StorageBinViewSet, basename="storage-bin")

from apps.warehouse import phase2_views

router.register("putaways", phase2_views.PutawayViewSet, basename="putaway")
router.register("stock-transfers-v2", phase2_views.StockTransferTypedViewSet, basename="stock-transfer-v2")
router.register("stock-adjustments-v2", phase2_views.StockAdjustmentTypedViewSet, basename="stock-adjustment-v2")
router.register("cycle-counts-v2", phase2_views.CycleCountViewSet, basename="cycle-count-v2")

urlpatterns = router.urls
