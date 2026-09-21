from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.accounts.rbac import user_has_permission


class RbacServiceTests(APITestCase):
    def setUp(self):
        self.module = Module.objects.create(code="organization", name="Organization")
        self.role = Role.objects.create(code="viewer", name="Viewer")
        self.user = User.objects.create_user(email="viewer@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=self.role)

    def test_user_without_permission_is_denied(self):
        self.assertFalse(user_has_permission(self.user, "organization", Action.CREATE))

    def test_user_with_granted_permission_is_allowed(self):
        RolePermission.objects.create(role=self.role, module=self.module, action=Action.VIEW, is_allowed=True)
        self.assertTrue(user_has_permission(self.user, "organization", Action.VIEW))

    def test_superuser_bypasses_rbac(self):
        superuser = User.objects.create_superuser(email="admin@ecowrap.com", password="Str0ng!Passw0rd")
        self.assertTrue(user_has_permission(superuser, "organization", Action.DELETE))

    def test_unauthenticated_user_is_denied(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(user_has_permission(AnonymousUser(), "organization", Action.VIEW))


class ModulePermissionEndpointTests(APITestCase):
    """Confirms HasModulePermission is enforced end-to-end on a real viewset."""

    def setUp(self):
        self.module = Module.objects.create(code="organization", name="Organization")
        self.role = Role.objects.create(code="org_viewer", name="Org Viewer")
        self.user = User.objects.create_user(email="orgviewer@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=self.role)
        login = self.client.post(
            reverse("auth-login"), {"email": self.user.email, "password": "Str0ng!Passw0rd"}, format="json"
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_list_denied_without_role_permission(self):
        response = self.client.get(reverse("company-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_allowed_once_permission_granted(self):
        RolePermission.objects.create(role=self.role, module=self.module, action=Action.VIEW, is_allowed=True)
        response = self.client.get(reverse("company-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_still_denied_when_only_view_granted(self):
        RolePermission.objects.create(role=self.role, module=self.module, action=Action.VIEW, is_allowed=True)
        response = self.client.post(reverse("company-list"), {"name": "New Co", "legal_name": "New Co Pvt Ltd"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
