from .base import *  # noqa: F401,F403
from .base import env

DEBUG = True

INSTALLED_APPS += ["django_extensions"]  # noqa: F405

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Relaxed only for local development; production.py enforces HTTPS.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False

INTERNAL_IPS = ["127.0.0.1"]

# Quick Tunnel (cloudflared trycloudflare.com) for temporary shared testing links.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://[a-z0-9-]+\.trycloudflare\.com$",
]
CSRF_TRUSTED_ORIGINS = list(
    {
        *CSRF_TRUSTED_ORIGINS,  # noqa: F405
        "https://*.trycloudflare.com",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    }
)
if ".trycloudflare.com" not in ALLOWED_HOSTS and "*" not in ALLOWED_HOSTS:  # noqa: F405
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, ".trycloudflare.com"]  # noqa: F405

# When running in the offline sandbox dev mode (no local Redis/Postgres server available),
# fall back to Django's in-memory cache so throttling/caching code paths don't hard-fail.
# This mirrors the DEV_USE_SQLITE escape hatch and must never be relied on outside local dev.
if env.bool("DEV_USE_SQLITE", default=False):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }
    CELERY_TASK_ALWAYS_EAGER = True

