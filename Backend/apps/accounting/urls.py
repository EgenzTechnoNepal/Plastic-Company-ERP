from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounting import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

urlpatterns = router.urls + [
    path("statements/", views.StatementsView.as_view(), name="accounting-statements"),
]
