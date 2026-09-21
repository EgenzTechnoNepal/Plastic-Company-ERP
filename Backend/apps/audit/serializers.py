from rest_framework import serializers

from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "timestamp",
            "user",
            "user_email",
            "action",
            "module",
            "model_name",
            "object_id",
            "document_number",
            "request_id",
            "ip_address",
            "user_agent",
            "before_data",
            "after_data",
            "reason",
        ]
        read_only_fields = fields
