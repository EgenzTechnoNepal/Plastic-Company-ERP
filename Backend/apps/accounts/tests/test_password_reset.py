from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PasswordResetToken, User


class PasswordResetTests(APITestCase):
    def setUp(self):
        self.password = "Str0ng!Passw0rd"
        self.user = User.objects.create_user(email="reset@ecowrap.com", password=self.password)

    @override_settings(DEBUG=True)
    def test_reset_issues_token_in_debug_and_confirms(self):
        res = self.client.post(reverse("auth-password-reset"), {"email": self.user.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        token = res.data["data"].get("token")
        self.assertTrue(token)
        self.assertTrue(PasswordResetToken.objects.filter(token=token).exists())

        confirm = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"token": token, "new_password": "N3w!Password9"},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("N3w!Password9"))
