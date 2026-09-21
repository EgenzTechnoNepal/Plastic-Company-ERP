from django.test import TestCase

from apps.accounts.models import User
from apps.audit.models import AuditAction, AuditLog
from apps.audit.services import AuditService


class AuditImmutabilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="clerk@ecowrap.com", password="Str0ng!Passw0rd")

    def test_log_creates_row(self):
        entry = AuditService.log(
            user=self.user,
            action=AuditAction.CREATE,
            module="sales",
            model_name="SalesOrder",
            object_id="123",
            document_number="SO-2082-83-000001",
            after_data={"status": "draft"},
        )
        self.assertIsNotNone(entry.pk)
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_existing_row_cannot_be_updated(self):
        entry = AuditService.log(user=self.user, action=AuditAction.CREATE, module="sales", model_name="SalesOrder")
        entry.reason = "tampering attempt"
        with self.assertRaises(PermissionError):
            entry.save()

    def test_row_cannot_be_deleted(self):
        entry = AuditService.log(user=self.user, action=AuditAction.CREATE, module="sales", model_name="SalesOrder")
        with self.assertRaises(PermissionError):
            entry.delete()

    def test_anonymous_mutation_is_logged_without_user(self):
        entry = AuditService.log(user=None, action=AuditAction.LOGIN, module="accounts", model_name="User")
        self.assertIsNone(entry.user)
