from rest_framework.throttling import ScopedRateThrottle


class LoginRateThrottle(ScopedRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        # Throttle by attempted email + IP so one bad actor can't lock out other users
        # by exhausting a shared per-IP bucket, and can't bypass throttling by IP-hopping alone.
        email = (request.data.get("email") or "").strip().lower() if hasattr(request, "data") else ""
        ident = f"{self.get_ident(request)}:{email}" if email else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class PasswordResetRateThrottle(ScopedRateThrottle):
    scope = "password_reset"


class SensitiveActionRateThrottle(ScopedRateThrottle):
    scope = "sensitive"
