from rest_framework.routers import DefaultRouter

from apps.warehouse import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("facilities", views.FacilityViewSet, basename="facility")
router.register("zones", views.ZoneViewSet, basename="zone")
router.register("racks", views.RackViewSet, basename="rack")
router.register("storage-bins", views.StorageBinViewSet, basename="storage-bin")

urlpatterns = router.urls
