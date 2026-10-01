"""Dashboard summary API smoke for M2 demo."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.organization.models import Company


class DashboardSummaryTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Eco Dash", legal_name="Eco Dash Pvt")
        self.user = User.objects.create_superuser(email="dash@ecowrap.com", password="Str0ng!Passw0rd")
        self.client.force_authenticate(self.user)

    def test_dashboard_summary_ok(self):
        url = reverse("dashboard-summary")
        res = self.client.get(url, {"company": str(self.company.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.data.get("data", res.data)
        self.assertEqual(body["company_id"], str(self.company.id))
        self.assertIn("inventory", body)
        self.assertIn("purchase", body)
        self.assertIn("sales", body)
        self.assertIn("quality", body)
