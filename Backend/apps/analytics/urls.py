from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.analytics import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

urlpatterns = router.urls + [
    path("ask/", views.AskView.as_view(), name="analytics-ask"),
]
