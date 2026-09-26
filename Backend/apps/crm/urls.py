from rest_framework.routers import DefaultRouter

from apps.crm import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("customer-masters", views.CustomerMasterViewSet, basename="customer-master")

urlpatterns = router.urls
