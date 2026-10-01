from rest_framework.routers import DefaultRouter

from apps.crm import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("customer-masters", views.CustomerMasterViewSet, basename="customer-master")
router.register("contact-masters", views.ContactViewSet, basename="contact-master")
router.register("party-addresses", views.PartyAddressViewSet, basename="party-address")
router.register("activity-masters", views.CrmActivityViewSet, basename="activity-master")

urlpatterns = router.urls
