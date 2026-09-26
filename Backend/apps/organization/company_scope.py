"""
Multi-company isolation for typed Phase 1 masters.

Do not trust a client-supplied company UUID. Access is derived from the
authenticated user's active UserRole → Branch → Company (or unscoped / superuser).
"""

from __future__ import annotations

from uuid import UUID

from apps.core.exceptions import ERPError


class CompanyAccessDenied(ERPError):
    status_code = 403
    default_code = "COMPANY_ACCESS_DENIED"


def user_allowed_company_ids(user) -> frozenset[UUID] | None:
    """
    Return the set of Company PKs the user may access.

    None  = unrestricted (superuser, or any active role with branch=NULL)
    empty = authenticated but no company scope (deny all company-scoped data)
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    if getattr(user, "is_superuser", False):
        return None

    roles = user.user_roles.filter(is_active=True)
    if not roles.exists():
        return frozenset()
    if roles.filter(branch__isnull=True).exists():
        return None

    ids = roles.exclude(branch__isnull=True).values_list("branch__company_id", flat=True)
    return frozenset(cid for cid in ids if cid is not None)


def company_pk(value) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    pk = getattr(value, "pk", None)
    if pk is not None:
        return pk
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def resolve_company_id(obj, company_field: str = "company") -> UUID | None:
    """Resolve company PK via a dotted attribute path (e.g. warehouse__company)."""
    if obj is None or not company_field:
        return None
    current = obj
    for part in company_field.split("__"):
        if current is None:
            return None
        # Prefer *_id for FK without fetch when final part is 'company'
        if part == "company" and hasattr(current, "company_id"):
            return current.company_id
        current = getattr(current, part, None)
    return company_pk(current)


def assert_company_allowed(user, company_id, *, message: str | None = None) -> None:
    allowed = user_allowed_company_ids(user)
    if allowed is None:
        return
    cid = company_pk(company_id)
    if cid is None:
        raise CompanyAccessDenied(
            message or "A valid company is required.",
            code="COMPANY_REQUIRED",
            fields={"company": "required"},
        )
    if cid not in allowed:
        raise CompanyAccessDenied(
            message or "You are not authorized for this company.",
            fields={"company": str(cid)},
        )


def assert_related_same_company(company_id, related_name: str, related_obj, related_company_field: str = "company") -> None:
    if related_obj is None or company_id is None:
        return
    other = resolve_company_id(related_obj, related_company_field)
    if other is not None and company_pk(company_id) != company_pk(other):
        raise CompanyAccessDenied(
            f"{related_name} belongs to a different company.",
            code="CROSS_COMPANY_REFERENCE",
            fields={related_name: str(getattr(related_obj, "pk", related_obj))},
        )


class CompanyScopedMixin:
    """
    Filter querysets and gate writes by company.

    Set `company_field` to the ORM path to Company on this model
    (e.g. "company", "warehouse__company", "document__company", "item__company").
    Set to None for global catalogs (UOM, Incoterm, Currency).
    """

    company_field: str | None = "company"
    #: On create, if `company` is absent, derive from these validated FK names (in order).
    company_from_related: tuple[str, ...] = ()
    #: Map validated FK name → company path on that related object for same-company checks.
    related_company_fields: dict[str, str] = {
        "preferred_supplier": "company",
        "supplier": "company",
        "item": "company",
        "warehouse": "company",
        "bin": "warehouse__company",
        "lot": "company",
        "tax_category": "company",
        "branch": "company",
        "document": "company",
        "component": "document__company",
        "zone": "warehouse__company",
        "rack": "zone__warehouse__company",
        "fiscal_year": "company",
    }

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.company_field:
            return qs
        allowed = user_allowed_company_ids(self.request.user)
        if allowed is None:
            return qs
        if not allowed:
            return qs.none()
        return qs.filter(**{f"{self.company_field}__in": allowed})

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if self.company_field:
            assert_company_allowed(request.user, resolve_company_id(obj, self.company_field))

    def _resolve_write_company_id(self, validated_data, instance=None):
        if "company" in validated_data and validated_data["company"] is not None:
            return company_pk(validated_data["company"])
        for rel in self.company_from_related:
            related = validated_data.get(rel)
            if related is None:
                continue
            path = self.related_company_fields.get(rel, "company")
            cid = resolve_company_id(related, path)
            if cid is not None:
                return cid
        if instance is not None and self.company_field:
            return resolve_company_id(instance, self.company_field)
        return None

    def _assert_validated_company_access(self, validated_data, instance=None):
        if not self.company_field and not self.company_from_related:
            return
        company_id = self._resolve_write_company_id(validated_data, instance=instance)
        if company_id is not None:
            assert_company_allowed(self.request.user, company_id)
        elif instance is None and self.company_field == "company" and "company" not in validated_data:
            # Model will still require company; fail closed if body omitted company on direct masters
            if not self.company_from_related:
                raise CompanyAccessDenied(
                    "Company is required.",
                    code="COMPANY_REQUIRED",
                    fields={"company": "required"},
                )

        # Cross-company FK references
        for name, path in self.related_company_fields.items():
            if name not in validated_data or validated_data[name] is None:
                continue
            related = validated_data[name]
            related_cid = resolve_company_id(related, path)
            if related_cid is None:
                continue
            assert_company_allowed(self.request.user, related_cid)
            if company_id is not None:
                assert_related_same_company(company_id, name, related, path)

        # Prevent reassignment of company to an unauthorized / different tenant mid-update
        if instance is not None and "company" in validated_data and validated_data["company"] is not None:
            new_cid = company_pk(validated_data["company"])
            old_cid = resolve_company_id(instance, self.company_field) if self.company_field else None
            if old_cid is not None and new_cid != old_cid:
                assert_company_allowed(self.request.user, new_cid)

    def perform_create(self, serializer):
        self._assert_validated_company_access(serializer.validated_data)
        return super().perform_create(serializer)

    def perform_update(self, serializer):
        self._assert_validated_company_access(serializer.validated_data, instance=serializer.instance)
        return super().perform_update(serializer)

    def perform_destroy(self, instance):
        if self.company_field:
            assert_company_allowed(self.request.user, resolve_company_id(instance, self.company_field))
        return super().perform_destroy(instance)
