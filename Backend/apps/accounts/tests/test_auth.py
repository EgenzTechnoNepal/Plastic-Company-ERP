from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User


class AuthFlowTests(APITestCase):
    def setUp(self):
        self.password = "Str0ng!Passw0rd"
        self.user = User.objects.create_user(email="sales@ecowrap.com", password=self.password)

    def test_login_returns_access_and_refresh_tokens(self):
        response = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])
        self.assertEqual(response.data["data"]["user"]["email"], self.user.email)

    def test_login_with_wrong_password_fails(self):
        response = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_account_locks_after_max_failed_attempts(self):
        for _ in range(5):
            self.client.post(reverse("auth-login"), {"email": self.user.email, "password": "wrong"}, format="json")

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.locked_until)

        response = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_rotates_token(self):
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        refresh_token = login.data["data"]["refresh"]

        response = self.client.post(reverse("auth-refresh"), {"refresh": refresh_token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertNotEqual(response.data["data"]["refresh"], refresh_token)

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        access = login.data["data"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["email"], self.user.email)

    def test_logout_blacklists_refresh_token(self):
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        access = login.data["data"]["access"]
        refresh = login.data["data"]["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        logout_response = self.client.post(reverse("auth-logout"), {"refresh": refresh}, format="json")
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        reuse_response = self.client.post(reverse("auth-refresh"), {"refresh": refresh}, format="json")
        self.assertEqual(reuse_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_requires_current_password(self):
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": self.password}, format="json"
        )
        access = login.data["data"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        bad = self.client.post(
            reverse("auth-change-password"),
            {"old_password": "wrong", "new_password": "N3wStr0ng!Pass"},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        good = self.client.post(
            reverse("auth-change-password"),
            {"old_password": self.password, "new_password": "N3wStr0ng!Pass"},
            format="json",
        )
        self.assertEqual(good.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("N3wStr0ng!Pass"))
