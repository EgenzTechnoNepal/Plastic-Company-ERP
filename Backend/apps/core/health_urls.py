from django.urls import path

from apps.core import health

urlpatterns = [
    path("", health.liveness, name="health-live"),
    path("ready/", health.readiness, name="health-ready"),
]
