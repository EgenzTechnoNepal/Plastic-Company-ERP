"""
RBAC evaluation service. Every permission check ultimately funnels through
user_has_permission() so there is exactly one place that decides "can this
user do this action on this module/screen".
"""

from django.db.models import Q

from apps.accounts.models import Action, RolePermission, UserRole


def get_user_role_ids(user) -> list:
    if not user or not user.is_authenticated:
        return []
    return list(UserRole.objects.filter(user=user, is_active=True).values_list("role_id", flat=True))


def user_has_permission(user, module_code: str, action: str, screen_code: str | None = None) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    role_ids = get_user_role_ids(user)
    if not role_ids:
        return False

    qs = RolePermission.objects.filter(
        role_id__in=role_ids,
        module__code=module_code,
        action=action,
        is_allowed=True,
    )
    if screen_code:
        qs = qs.filter(Q(screen__isnull=True) | Q(screen__code=screen_code))
    return qs.exists()


def get_field_permissions(user, module_code: str) -> dict:
    """Returns {field_name: {"can_view": bool, "can_edit": bool}} merged across the user's roles."""
    from apps.accounts.models import FieldPermission

    if not user or not user.is_authenticated:
        return {}
    if user.is_superuser:
        return {}

    role_ids = get_user_role_ids(user)
    permissions: dict[str, dict[str, bool]] = {}
    for fp in FieldPermission.objects.filter(role_id__in=role_ids, module__code=module_code):
        existing = permissions.setdefault(fp.field_name, {"can_view": False, "can_edit": False})
        existing["can_view"] = existing["can_view"] or fp.can_view
        existing["can_edit"] = existing["can_edit"] or fp.can_edit
    return permissions


ACTION_BY_METHOD = {
    "GET": Action.VIEW,
    "POST": Action.CREATE,
    "PUT": Action.EDIT,
    "PATCH": Action.EDIT,
    "DELETE": Action.DELETE,
}
