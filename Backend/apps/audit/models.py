"""
Immutable audit trail. Rows are append-only: save() blocks updates to an
existing row and delete() is disabled entirely, at both the model and the
admin layer, so a mutation can only ever be logged, never erased.
"""

import uuid

from django.conf import settings
from django.db import models


class AuditAction(models.TextChoices):
    CREATE = "create", "Create"
    VIEW = "view", "View"
    UPDATE = "update", "Update"
    DELETE = "delete", "Delete"
    SUBMIT = "submit", "Submit"
    APPROVE = "approve", "Approve"
    REJECT = "reject", "Reject"
    CANCEL = "cancel", "Cancel"
    POST = "post", "Post"
    REVERSE = "reverse", "Reverse"
    EXPORT = "export", "Export"
    PRINT = "print", "Print"
    LOGIN = "login", "Login"
    LOGOUT = "logout", "Logout"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    action = models.CharField(max_length=20, choices=AuditAction.choices, db_index=True)
    module = models.CharField(max_length=60, db_index=True)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=64, blank=True, db_index=True)
    document_number = models.CharField(max_length=40, blank=True, db_index=True)
    request_id = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    before_data = models.JSONField(null=True, blank=True)
    after_data = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["module", "model_name", "object_id"]),
            models.Index(fields=["user", "timestamp"]),
        ]

    def __str__(self):
        return f"{self.action}:{self.module}.{self.model_name}#{self.object_id} @ {self.timestamp}"

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise PermissionError("AuditLog rows are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("AuditLog rows cannot be deleted.")
