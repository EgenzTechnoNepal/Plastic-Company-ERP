"""Approval foundation services — transactional, company-scoped, RBAC-gated."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.rbac import user_has_permission
from apps.accounts.models import Action
from apps.audit.services import AuditService
from apps.core.events import emit
from apps.core.exceptions import ERPError
from apps.organization.company_scope import assert_company_allowed
from apps.workflow.models import ApprovalRequest, ApprovalStatus


class ApprovalError(ERPError):
    default_code = "APPROVAL_ERROR"


def _assert_can_approve(user, module_code: str) -> None:
    if user is None or not getattr(user, "is_authenticated", False):
        raise ApprovalError("Authentication required.", code="AUTH_REQUIRED", status_code=401)
    if getattr(user, "is_superuser", False):
        return
    if not user_has_permission(user, module_code, Action.APPROVE):
        raise ApprovalError(
            "You do not have approval permission for this module.",
            code="APPROVAL_FORBIDDEN",
            status_code=403,
        )


@transaction.atomic
def request_approval(
    *,
    company,
    module_code: str,
    target_type: str,
    target_id,
    user=None,
    document_number: str = "",
    title: str = "",
    comments: str = "",
) -> ApprovalRequest:
    assert_company_allowed(user, company.id)
    # Block duplicate open requests for same target
    open_exists = ApprovalRequest.objects.filter(
        company=company,
        target_type=target_type,
        target_id=target_id,
        status__in=[ApprovalStatus.DRAFT, ApprovalStatus.PENDING],
        is_active=True,
    ).exists()
    if open_exists:
        raise ApprovalError(
            "An open approval request already exists for this document.",
            code="APPROVAL_ALREADY_OPEN",
        )
    req = ApprovalRequest.objects.create(
        company=company,
        module_code=module_code,
        target_type=target_type,
        target_id=target_id,
        document_number=document_number,
        title=title,
        status=ApprovalStatus.PENDING,
        requested_by=user,
        requested_at=timezone.now(),
        comments=comments,
        created_by=user,
        updated_by=user,
    )
    AuditService.log(
        user=user,
        action="submit",
        module=module_code,
        model_name="ApprovalRequest",
        object_id=str(req.id),
        document_number=document_number,
        after_data={"status": req.status, "target_type": target_type, "target_id": str(target_id)},
    )
    emit(
        "ApprovalRequested",
        {
            "approval_id": str(req.id),
            "target_type": target_type,
            "target_id": str(target_id),
            "module_code": module_code,
        },
    )
    return req


@transaction.atomic
def approve_request(*, approval: ApprovalRequest, user=None, reason: str = "") -> ApprovalRequest:
    approval = ApprovalRequest.objects.select_for_update().get(pk=approval.pk)
    assert_company_allowed(user, approval.company_id)
    _assert_can_approve(user, approval.module_code)
    if approval.status != ApprovalStatus.PENDING:
        raise ApprovalError(
            f"Cannot approve request in status {approval.status}.",
            code="INVALID_STATUS",
            fields={"status": approval.status},
        )
    approval.status = ApprovalStatus.APPROVED
    approval.decided_by = user
    approval.decided_at = timezone.now()
    approval.decision_reason = reason
    approval.updated_by = user
    approval.save(
        update_fields=[
            "status",
            "decided_by",
            "decided_at",
            "decision_reason",
            "updated_by",
            "updated_at",
        ]
    )
    AuditService.log(
        user=user,
        action="approve",
        module=approval.module_code,
        model_name="ApprovalRequest",
        object_id=str(approval.id),
        document_number=approval.document_number,
        after_data={"status": approval.status},
        reason=reason,
    )
    emit(
        "ApprovalApproved",
        {
            "approval_id": str(approval.id),
            "target_type": approval.target_type,
            "target_id": str(approval.target_id),
        },
    )
    return approval


@transaction.atomic
def reject_request(*, approval: ApprovalRequest, user=None, reason: str = "") -> ApprovalRequest:
    approval = ApprovalRequest.objects.select_for_update().get(pk=approval.pk)
    assert_company_allowed(user, approval.company_id)
    _assert_can_approve(user, approval.module_code)
    if approval.status != ApprovalStatus.PENDING:
        raise ApprovalError(
            f"Cannot reject request in status {approval.status}.",
            code="INVALID_STATUS",
            fields={"status": approval.status},
        )
    if not (reason or "").strip():
        raise ApprovalError("Rejection reason is required.", code="REASON_REQUIRED")
    approval.status = ApprovalStatus.REJECTED
    approval.decided_by = user
    approval.decided_at = timezone.now()
    approval.decision_reason = reason
    approval.updated_by = user
    approval.save(
        update_fields=[
            "status",
            "decided_by",
            "decided_at",
            "decision_reason",
            "updated_by",
            "updated_at",
        ]
    )
    AuditService.log(
        user=user,
        action="reject",
        module=approval.module_code,
        model_name="ApprovalRequest",
        object_id=str(approval.id),
        document_number=approval.document_number,
        after_data={"status": approval.status},
        reason=reason,
    )
    emit(
        "ApprovalRejected",
        {
            "approval_id": str(approval.id),
            "target_type": approval.target_type,
            "target_id": str(approval.target_id),
        },
    )
    return approval


@transaction.atomic
def cancel_request(*, approval: ApprovalRequest, user=None, reason: str = "") -> ApprovalRequest:
    approval = ApprovalRequest.objects.select_for_update().get(pk=approval.pk)
    assert_company_allowed(user, approval.company_id)
    if approval.status not in {ApprovalStatus.DRAFT, ApprovalStatus.PENDING}:
        raise ApprovalError(
            f"Cannot cancel request in status {approval.status}.",
            code="INVALID_STATUS",
        )
    # Requester or superuser / module approve may cancel
    is_requester = approval.requested_by_id and user and approval.requested_by_id == user.id
    if not is_requester and not getattr(user, "is_superuser", False):
        _assert_can_approve(user, approval.module_code)
    approval.status = ApprovalStatus.CANCELLED
    approval.decided_by = user
    approval.decided_at = timezone.now()
    approval.decision_reason = reason or "Cancelled"
    approval.updated_by = user
    approval.save(
        update_fields=[
            "status",
            "decided_by",
            "decided_at",
            "decision_reason",
            "updated_by",
            "updated_at",
        ]
    )
    return approval
