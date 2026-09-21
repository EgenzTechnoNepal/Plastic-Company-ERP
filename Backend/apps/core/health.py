from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

try:
    import redis as redis_lib
except ImportError:  # pragma: no cover
    redis_lib = None


@require_GET
def liveness(request):
    """Process is up. Does not check dependencies."""
    return JsonResponse({"status": "ok"})


def _sandbox_without_redis() -> bool:
    """True when local sqlite/locmem mode is on (no Redis process expected)."""
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return True
    backend = str(settings.CACHES.get("default", {}).get("BACKEND", ""))
    return "locmem" in backend.lower()


@require_GET
def readiness(request):
    """Process + database + redis are reachable (redis skipped in sqlite sandbox)."""
    checks = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"error: {exc}"

    if _sandbox_without_redis():
        checks["redis"] = "skipped"
    else:
        try:
            if redis_lib is None:
                raise RuntimeError("redis package not installed")
            client = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            client.ping()
            checks["redis"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["redis"] = f"error: {exc}"

    healthy = all(v in {"ok", "skipped"} for v in checks.values())
    return JsonResponse({"status": "ok" if healthy else "degraded", "checks": checks}, status=200 if healthy else 503)
