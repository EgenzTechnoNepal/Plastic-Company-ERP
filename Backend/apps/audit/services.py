"""
Single entry point for writing audit rows. Every mutating view/service should
call AuditService.log(...) — never create AuditLog rows directly elsewhere,
so the shape of the audit trail stays consistent.
"""

from apps.audit.models import AuditLog
from apps.core.middleware import get_current_request_context


class AuditService:
    @staticmethod
    def log(
        *,
        user,
        action: str,
        module: str,
        model_name: str,
        object_id: str = "",
        document_number: str = "",
        before_data=None,
        after_data=None,
        reason: str = "",
    ) -> AuditLog:
        ctx = get_current_request_context()
        return AuditLog.objects.create(
            user=user if (user is not None and getattr(user, "is_authenticated", False)) else None,
            action=action,
            module=module,
            model_name=model_name,
            object_id=str(object_id),
            document_number=document_number,
            request_id=ctx.request_id if ctx else "",
            ip_address=ctx.ip_address if ctx else None,
            user_agent=ctx.user_agent if ctx else "",
            before_data=before_data,
            after_data=after_data,
            reason=reason,
        )
