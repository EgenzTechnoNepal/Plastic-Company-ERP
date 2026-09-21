"""
Captures per-request context (request id, client IP, user agent) in a
contextvar so apps.audit.services.AuditService can attach it to log entries
without every call site having to thread the request object through.
"""

import contextvars
import uuid
from dataclasses import dataclass


@dataclass
class RequestContext:
    request_id: str
    ip_address: str | None
    user_agent: str


_current_request_context: contextvars.ContextVar[RequestContext | None] = contextvars.ContextVar(
    "current_request_context", default=None
)


def get_current_request_context() -> RequestContext | None:
    return _current_request_context.get()


def _client_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        token = _current_request_context.set(
            RequestContext(
                request_id=request.request_id,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
            )
        )
        try:
            response = self.get_response(request)
        finally:
            _current_request_context.reset(token)
        response["X-Request-ID"] = request.request_id
        return response
