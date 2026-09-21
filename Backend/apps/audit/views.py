from rest_framework import viewsets

from apps.accounts.permissions import HasModulePermission
from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """GET-only: audit rows can never be created, changed or deleted via the API."""

    queryset = AuditLog.objects.select_related("user").all()
    serializer_class = AuditLogSerializer
    permission_classes = [HasModulePermission]
    module_code = "audit"
    filterset_fields = ["module", "model_name", "action", "user", "document_number"]
    search_fields = ["document_number", "object_id", "model_name"]
    ordering_fields = ["timestamp"]
