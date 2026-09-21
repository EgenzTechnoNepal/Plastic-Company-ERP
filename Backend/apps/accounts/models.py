"""
Custom user model plus the ERP's Role-Based Access Control schema.

RBAC is deliberately NOT just Django's default Group/Permission system: the
proposal requires permission checks at Module + Screen + Action + Role level,
enforced server-side on every request (see apps.accounts.permissions).
"""

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from apps.accounts.managers import UserManager
from apps.core.models import BaseModel


class User(BaseModel, AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_staff = models.BooleanField(default=False)

    must_change_password = models.BooleanField(default=False)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    two_factor_enabled = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta(BaseModel.Meta):
        ordering = ["email"]

    def __str__(self):
        return self.email

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.email

    @property
    def date_joined(self):
        return self.created_at


class Module(BaseModel):
    """Top-level ERP module used as the coarse-grained permission boundary, e.g. 'sales'."""

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=100)

    class Meta(BaseModel.Meta):
        ordering = ["code"]

    def __str__(self):
        return self.name


class Screen(BaseModel):
    """A specific screen/sub-resource inside a module, e.g. 'sales.orders'."""

    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="screens")
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=100)

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["module", "code"], name="uq_screen_module_code")]

    def __str__(self):
        return f"{self.module.code}.{self.code}"


class Action(models.TextChoices):
    VIEW = "view", "View"
    CREATE = "create", "Create"
    EDIT = "edit", "Edit"
    DELETE = "delete", "Delete"
    SUBMIT = "submit", "Submit"
    APPROVE = "approve", "Approve"
    REJECT = "reject", "Reject"
    CANCEL = "cancel", "Cancel"
    POST = "post", "Post"
    REVERSE = "reverse", "Reverse"
    EXPORT = "export", "Export"
    PRINT = "print", "Print"
    VIEW_SENSITIVE = "view_sensitive", "View Sensitive"


class Role(BaseModel):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    #: System roles (e.g. administrator) cannot be deleted through the API.
    is_system = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ["code"]

    def __str__(self):
        return self.name


class RolePermission(BaseModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="permissions")
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="role_permissions")
    screen = models.ForeignKey(Screen, null=True, blank=True, on_delete=models.CASCADE, related_name="role_permissions")
    action = models.CharField(max_length=20, choices=Action.choices)
    is_allowed = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["role", "module", "screen", "action"], name="uq_rolepermission_role_module_screen_action"
            )
        ]

    def __str__(self):
        return f"{self.role.code}:{self.module.code}:{self.screen.code if self.screen else '*'}:{self.action}"


class UserRole(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_roles")
    branch = models.ForeignKey(
        "organization.Branch", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta(BaseModel.Meta):
        constraints = [models.UniqueConstraint(fields=["user", "role", "branch"], name="uq_userrole_user_role_branch")]

    def __str__(self):
        return f"{self.user.email} -> {self.role.code}"


class FieldPermission(BaseModel):
    """Field-level visibility/edit control per role + module, e.g. hide payroll's `basic` salary field."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="field_permissions")
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="field_permissions")
    field_name = models.CharField(max_length=100)
    can_view = models.BooleanField(default=True)
    can_edit = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["role", "module", "field_name"], name="uq_fieldpermission_role_module_field")
        ]

    def __str__(self):
        return f"{self.role.code}:{self.module.code}.{self.field_name}"


class LoginHistory(BaseModel):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="login_history")
    email_attempted = models.EmailField()
    was_successful = models.BooleanField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    failure_reason = models.CharField(max_length=100, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Login history"

    def __str__(self):
        return f"{self.email_attempted} {'OK' if self.was_successful else 'FAIL'} @ {self.created_at}"


class PasswordResetToken(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"reset:{self.user.email}"
