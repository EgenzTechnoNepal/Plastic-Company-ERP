from rest_framework.routers import DefaultRouter

from apps.procurement import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("vendors", views.VendorViewSet, basename="vendor")
router.register("incoterms", views.IncotermViewSet, basename="incoterm")
router.register("supplier-documents", views.SupplierDocumentViewSet, basename="supplier-document")

urlpatterns = router.urls
