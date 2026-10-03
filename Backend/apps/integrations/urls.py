from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.integrations import views
from apps.integrations.gemini_views import GeminiExtractGateBillView, GeminiStatusView

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

urlpatterns = [
    path("gemini/status/", GeminiStatusView.as_view(), name="gemini-status"),
    path("gemini/extract-gate-bill/", GeminiExtractGateBillView.as_view(), name="gemini-extract-gate-bill"),
] + router.urls
