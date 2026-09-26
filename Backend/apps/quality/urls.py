from rest_framework.routers import DefaultRouter

from apps.quality import views
from apps.quality import phase2_views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

router.register("lot-inspections", phase2_views.QCInspectionViewSet, basename="lot-inspection")

urlpatterns = router.urls
