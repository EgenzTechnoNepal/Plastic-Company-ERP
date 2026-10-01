from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.crm.models import Record


class CrmRecordApiTests(APITestCase):
    def setUp(self):
        self.password = "Str0ng!Passw0rd"
        self.user = User.objects.create_superuser(email="admin@test.com", password=self.password)
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_create_list_and_approve_customer(self):
        payload = {
            "code": "CUST-T01",
            "title": "Test Customer",
            "date": date.today().isoformat(),
            "status": "active",
            "fields": {"city": "Itahari"},
            "lines": [],
        }
        created = self.client.post("/api/v1/crm/customers/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_200_OK, created.data)
        self.assertEqual(created.data["data"]["code"], "CUST-T01")
        pk = created.data["data"]["id"]

        listed = self.client.get("/api/v1/crm/customers/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(listed.data["meta"]["count"], 1)

        approved = self.client.post(f"/api/v1/crm/customers/{pk}/approve/", {"comment": "ok"}, format="json")
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertEqual(approved.data["data"]["status"], "approved")
        self.assertTrue(Record.objects.filter(code="CUST-T01", entity="customers").exists())
