"""CRM domain services — company isolation, audit, events."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.crm.models import (
    ActivityStatus,
    Contact,
    CrmActivity,
    Customer,
    PartyAddress,
)
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.models import Supplier


class CrmError(ERPError):
    default_code = "CRM_ERROR"


def _customer_snapshot(c: Customer) -> dict:
    return {
        "code": c.code,
        "legal_name": c.legal_name,
        "trading_name": c.trading_name,
        "is_active": c.is_active,
        "email": c.email,
        "phone": c.phone,
        "credit_limit": str(c.credit_limit) if c.credit_limit is not None else None,
    }


@transaction.atomic
def create_customer(*, company, code: str, legal_name: str, user=None, **fields) -> Customer:
    assert_company_allowed(user, company.id)
    currency = fields.get("currency")
    if currency is not None:
        assert_related_same_company(company.id, "currency", currency)
    if Customer.objects.filter(company=company, code=code).exists():
        raise CrmError("Customer code already exists for this company.", code="DUPLICATE_CODE")
    customer = Customer.objects.create(
        company=company,
        code=code,
        legal_name=legal_name,
        created_by=user,
        updated_by=user,
        **fields,
    )
    AuditService.log(
        user=user,
        action="create",
        module="crm",
        model_name="Customer",
        object_id=str(customer.id),
        document_number=customer.code,
        after_data=_customer_snapshot(customer),
    )
    emit("CustomerCreated", {"customer_id": str(customer.id), "code": customer.code})
    return customer


@transaction.atomic
def update_customer(*, customer: Customer, user=None, **fields) -> Customer:
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    assert_company_allowed(user, customer.company_id)
    before = _customer_snapshot(customer)
    if "currency" in fields and fields["currency"] is not None:
        assert_related_same_company(customer.company_id, "currency", fields["currency"])
    if "company" in fields:
        raise CrmError("Cannot change customer company.", code="COMPANY_IMMUTABLE")
    if "code" in fields and fields["code"] != customer.code:
        if Customer.objects.filter(company_id=customer.company_id, code=fields["code"]).exclude(
            pk=customer.pk
        ).exists():
            raise CrmError("Customer code already exists for this company.", code="DUPLICATE_CODE")
    for key, value in fields.items():
        if hasattr(customer, key) and key not in {"id", "company", "created_by", "created_at"}:
            setattr(customer, key, value)
    customer.updated_by = user
    customer.save()
    AuditService.log(
        user=user,
        action="update",
        module="crm",
        model_name="Customer",
        object_id=str(customer.id),
        document_number=customer.code,
        before_data=before,
        after_data=_customer_snapshot(customer),
    )
    emit("CustomerUpdated", {"customer_id": str(customer.id), "code": customer.code})
    return customer


@transaction.atomic
def deactivate_customer(*, customer: Customer, user=None) -> Customer:
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    assert_company_allowed(user, customer.company_id)
    before = _customer_snapshot(customer)
    customer.is_active = False
    customer.updated_by = user
    customer.save(update_fields=["is_active", "updated_by", "updated_at"])
    AuditService.log(
        user=user,
        action="deactivate",
        module="crm",
        model_name="Customer",
        object_id=str(customer.id),
        document_number=customer.code,
        before_data=before,
        after_data=_customer_snapshot(customer),
    )
    emit("CustomerUpdated", {"customer_id": str(customer.id), "code": customer.code, "deactivated": True})
    return customer


@transaction.atomic
def create_contact(*, company, name: str, user=None, customer=None, supplier=None, **fields) -> Contact:
    assert_company_allowed(user, company.id)
    if customer is not None:
        assert_related_same_company(company.id, "customer", customer)
    if supplier is not None:
        assert_related_same_company(company.id, "supplier", supplier)
    contact = Contact.objects.create(
        company=company,
        name=name,
        customer=customer,
        supplier=supplier,
        created_by=user,
        updated_by=user,
        **fields,
    )
    AuditService.log(
        user=user,
        action="create",
        module="crm",
        model_name="Contact",
        object_id=str(contact.id),
        after_data={"name": contact.name, "customer_id": str(customer.id) if customer else None},
    )
    emit("ContactCreated", {"contact_id": str(contact.id), "name": contact.name})
    return contact


@transaction.atomic
def update_contact(*, contact: Contact, user=None, **fields) -> Contact:
    contact = Contact.objects.select_for_update().get(pk=contact.pk)
    assert_company_allowed(user, contact.company_id)
    if "customer" in fields and fields["customer"] is not None:
        assert_related_same_company(contact.company_id, "customer", fields["customer"])
    if "supplier" in fields and fields["supplier"] is not None:
        assert_related_same_company(contact.company_id, "supplier", fields["supplier"])
    if "company" in fields:
        raise CrmError("Cannot change contact company.", code="COMPANY_IMMUTABLE")
    for key, value in fields.items():
        if hasattr(contact, key) and key not in {"id", "company", "created_by", "created_at"}:
            setattr(contact, key, value)
    contact.updated_by = user
    contact.save()
    AuditService.log(
        user=user,
        action="update",
        module="crm",
        model_name="Contact",
        object_id=str(contact.id),
        after_data={"name": contact.name, "is_active": contact.is_active},
    )
    return contact


@transaction.atomic
def create_party_address(
    *, company, line1: str, user=None, customer=None, supplier=None, **fields
) -> PartyAddress:
    assert_company_allowed(user, company.id)
    if customer is not None:
        assert_related_same_company(company.id, "customer", customer)
    if supplier is not None:
        assert_related_same_company(company.id, "supplier", supplier)
    if customer is None and supplier is None:
        raise CrmError("Address must link to a customer or supplier.", code="PARTY_REQUIRED")
    return PartyAddress.objects.create(
        company=company,
        line1=line1,
        customer=customer,
        supplier=supplier,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def create_activity(
    *,
    company,
    subject: str,
    user=None,
    customer=None,
    supplier=None,
    contact=None,
    **fields,
) -> CrmActivity:
    assert_company_allowed(user, company.id)
    if customer is not None:
        assert_related_same_company(company.id, "customer", customer)
    if supplier is not None:
        assert_related_same_company(company.id, "supplier", supplier)
    if contact is not None:
        assert_related_same_company(company.id, "contact", contact)
        if contact.customer_id and customer and contact.customer_id != customer.id:
            raise CrmError("Contact does not belong to the given customer.", code="CONTACT_MISMATCH")
    activity = CrmActivity.objects.create(
        company=company,
        subject=subject,
        customer=customer,
        supplier=supplier,
        contact=contact,
        actor=user,
        created_by=user,
        updated_by=user,
        **fields,
    )
    AuditService.log(
        user=user,
        action="create",
        module="crm",
        model_name="CrmActivity",
        object_id=str(activity.id),
        after_data={"subject": activity.subject, "type": activity.activity_type},
    )
    emit(
        "CRMActivityCreated",
        {"activity_id": str(activity.id), "type": activity.activity_type, "subject": activity.subject},
    )
    return activity


@transaction.atomic
def complete_activity(*, activity: CrmActivity, user=None) -> CrmActivity:
    activity = CrmActivity.objects.select_for_update().get(pk=activity.pk)
    assert_company_allowed(user, activity.company_id)
    if activity.status == ActivityStatus.CANCELLED:
        raise CrmError("Cannot complete a cancelled activity.", code="INVALID_STATUS")
    activity.status = ActivityStatus.DONE
    activity.completed_at = timezone.now()
    activity.updated_by = user
    activity.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
    return activity


@transaction.atomic
def update_supplier_master(*, supplier: Supplier, user=None, **fields) -> Supplier:
    """CRM-facing supplier update — same typed Supplier identity as procurement."""
    supplier = Supplier.objects.select_for_update().get(pk=supplier.pk)
    assert_company_allowed(user, supplier.company_id)
    if "company" in fields:
        raise CrmError("Cannot change supplier company.", code="COMPANY_IMMUTABLE")
    before = {"code": supplier.code, "legal_name": supplier.legal_name, "is_active": supplier.is_active}
    for key, value in fields.items():
        if hasattr(supplier, key) and key not in {"id", "company", "created_by", "created_at"}:
            setattr(supplier, key, value)
    supplier.updated_by = user
    supplier.save()
    AuditService.log(
        user=user,
        action="update",
        module="procurement",
        model_name="Supplier",
        object_id=str(supplier.id),
        document_number=supplier.code,
        before_data=before,
        after_data={"code": supplier.code, "legal_name": supplier.legal_name, "is_active": supplier.is_active},
    )
    emit("SupplierUpdated", {"supplier_id": str(supplier.id), "code": supplier.code})
    return supplier
