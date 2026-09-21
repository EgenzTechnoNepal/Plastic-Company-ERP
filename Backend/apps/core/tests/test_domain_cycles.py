from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Record as InvRecord
from apps.sales.models import Record as SalesRecord


class AuthenticatedApiTest(APITestCase):
    def setUp(self):
        self.password = "Str0ng!Passw0rd"
        self.user = User.objects.create_superuser(email="admin@test.com", password=self.password)
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")


class SalesRecordApiTests(AuthenticatedApiTest):
    def test_create_sales_order(self):
        payload = {
            "code": "SO-T01",
            "title": "Test order",
            "date": date.today().isoformat(),
            "status": "draft",
            "fields": {"customerName": "Everest Mart"},
            "lines": [],
        }
        created = self.client.post("/api/v1/sales/orders/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_200_OK, created.data)
        self.assertTrue(SalesRecord.objects.filter(code="SO-T01", entity="sales_orders").exists())


class InventoryGenealogyTests(AuthenticatedApiTest):
    def test_batch_genealogy(self):
        batch = InvRecord.objects.create(
            entity="batches",
            code="BAT-T01",
            title="Test lot",
            date=date.today(),
            status="released",
            fields={"workOrder": "WO-001", "bom": "BOM-001"},
            links=[{"entity": "work_orders", "id": "wo-1", "label": "WO-001"}],
        )
        res = self.client.get(f"/api/v1/inventory/batches/{batch.id}/genealogy/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["data"]["work_order"], "WO-001")
        self.assertEqual(res.data["data"]["bom"], "BOM-001")


class AccountingStatementsTests(AuthenticatedApiTest):
    def test_statements_from_coa(self):
        from apps.accounting.models import Record as AccRecord

        AccRecord.objects.create(
            entity="accounts", code="4000", title="Sales", date=date.today(),
            status="active", fields={"group": "Income", "balance": 1000},
        )
        AccRecord.objects.create(
            entity="accounts", code="5000", title="COGS", date=date.today(),
            status="active", fields={"group": "Expense", "balance": 400},
        )
        res = self.client.get("/api/v1/accounting/statements/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["data"]["profit_and_loss"]["profit"], 600)


class AnalyticsAskTests(AuthenticatedApiTest):
    def test_ask_is_advisory(self):
        res = self.client.post("/api/v1/analytics/ask/", {"query": "Why is film below reorder?"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["data"]["requires_accept"])


class TwoFactorTests(AuthenticatedApiTest):
    def test_toggle_2fa(self):
        off = self.client.get("/api/v1/auth/2fa/")
        self.assertEqual(off.status_code, status.HTTP_200_OK)
        self.assertFalse(off.data["data"]["enabled"])
        on = self.client.post("/api/v1/auth/2fa/", {"enabled": True}, format="json")
        self.assertEqual(on.status_code, status.HTTP_200_OK)
        self.assertTrue(on.data["data"]["enabled"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)
