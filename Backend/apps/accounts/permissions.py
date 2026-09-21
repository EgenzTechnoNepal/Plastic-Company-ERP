"""
DRF permission classes enforcing the ERP's Module/Screen/Action RBAC.

Never trust frontend permission checks — these classes are the actual
enforcement point for every API request.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import ACTION_BY_METHOD, get_field_permissions, user_has_permission


class HasModulePermission(BasePermission):
    """
    Generic CRUD gate for ViewSets. The view must declare `module_code` and,
    optionally, `screen_code`. HTTP method is mapped to an Action via
    ACTION_BY_METHOD.
    """

    def has_permission(self, request, view):
        module_code = getattr(view, "module_code", None)
        if not module_code:
            # Fail closed: a view that forgot to declare its module is denied, not allowed.
            return False
        screen_code = getattr(view, "screen_code", None)
        action = ACTION_BY_METHOD.get(request.method)
        if action is None:
            return False
        return user_has_permission(request.user, module_code, action, screen_code)

    def has_object_permission(self, request, view, obj):
        # Object-level authorization: never rely on "the UUID was known" as access proof.
        owner_branch = getattr(obj, "branch", None)
        if owner_branch is not None and hasattr(request.user, "user_roles"):
            allowed_branches = set(
                request.user.user_roles.filter(is_active=True, branch__isnull=False).values_list(
                    "branch_id", flat=True
                )
            )
            has_unscoped_role = request.user.user_roles.filter(is_active=True, branch__isnull=True).exists()
            if allowed_branches and not has_unscoped_role and owner_branch.id not in allowed_branches:
                return False
        return self.has_permission(request, view)


class HasActionPermission(BasePermission):
    """
    Gate for explicit workflow endpoints (submit/approve/reject/cancel/post/
    reverse/export/print). The view action method must set
    `required_action` (an apps.accounts.models.Action value) on itself, e.g.
    via `@action(detail=True, methods=["post"])` plus a class-level
    `action_permission_map = {"submit": Action.SUBMIT, ...}`.
    """

    def has_permission(self, request, view):
        module_code = getattr(view, "module_code", None)
        action_map = getattr(view, "action_permission_map", {})
        required_action = action_map.get(getattr(view, "action", None))
        if not module_code or not required_action:
            return False
        screen_code = getattr(view, "screen_code", None)
        return user_has_permission(request.user, module_code, required_action, screen_code)


class HasFieldPermission:
    """
    Serializer mixin (not a DRF permission) enforcing field-level visibility
    and editability from FieldPermission records. Mix into any ModelSerializer
    and set `module_code` on the serializer class.
    """

    module_code: str = ""

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is None or not self.module_code:
            return fields

        permissions = get_field_permissions(request.user, self.module_code)
        for field_name, rule in permissions.items():
            field = fields.get(field_name)
            if field is None:
                continue
            if not rule.get("can_view", True):
                fields.pop(field_name, None)
                continue
            if not rule.get("can_edit", True):
                field.read_only = True
        return fields
