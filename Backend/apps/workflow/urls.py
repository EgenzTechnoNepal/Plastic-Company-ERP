from rest_framework.routers import DefaultRouter

from apps.workflow import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

urlpatterns = router.urls
