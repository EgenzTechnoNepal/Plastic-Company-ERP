"""
Phase B — approval foundation tests.
"""

from django.urls import reverse
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.audit.models import AuditLog
from apps.organization.models import Branch, Company
from apps.workflow.approval_services import (
    ApprovalError,
    approve_request,
    cancel_request,
    reject_request,
    request_approval,
)
from apps.workflow.models import ApprovalRequest, ApprovalStatus
import uuid


class ApprovalServiceTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap AP", legal_name="EcoWrap AP Pvt")
        self.other = Company.objects.create(name="Other AP", legal_name="Other AP Ltd")
        self.user = User.objects.create_superuser(email="ap@ecowrap.com", password="Str0ng!Passw0rd")
        Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        self.target_id = uuid.uuid4()

    def test_request_approve_reject_flow(self):
        req = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=self.target_id,
            user=self.user,
            document_number="CUST-1",
            title="Approve customer",
        )
        self.assertEqual(req.status, ApprovalStatus.PENDING)
        approved = approve_request(approval=req, user=self.user, reason="ok")
        self.assertEqual(approved.status, ApprovalStatus.APPROVED)

        req2 = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=uuid.uuid4(),
            user=self.user,
            document_number="CUST-2",
        )
        rejected = reject_request(approval=req2, user=self.user, reason="incomplete")
        self.assertEqual(rejected.status, ApprovalStatus.REJECTED)

    def test_duplicate_open_blocked(self):
        tid = uuid.uuid4()
        request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=tid,
            user=self.user,
        )
        with self.assertRaises(ApprovalError) as ctx:
            request_approval(
                company=self.company,
                module_code="crm",
                target_type="crm.Customer",
                target_id=tid,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "APPROVAL_ALREADY_OPEN")

    def test_double_approve_blocked(self):
        req = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=uuid.uuid4(),
            user=self.user,
        )
        approve_request(approval=req, user=self.user)
        with self.assertRaises(ApprovalError) as ctx:
            approve_request(approval=req, user=self.user)
        self.assertEqual(ctx.exception.code, "INVALID_STATUS")

    def test_unauthorized_approve_blocked(self):
        Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        branch = Branch.objects.create(company=self.company, code="B1", name="B1")
        role = Role.objects.create(code="crm_editor", name="CRM Editor")
        mod = Module.objects.get(code="crm")
        for action in (Action.VIEW, Action.CREATE, Action.EDIT):
            RolePermission.objects.create(role=role, module=mod, action=action, is_allowed=True)
        editor = User.objects.create_user(email="editor@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=editor, role=role, branch=branch)

        req = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=uuid.uuid4(),
            user=self.user,
        )
        with self.assertRaises(ApprovalError) as ctx:
            approve_request(approval=req, user=editor)
        self.assertEqual(ctx.exception.code, "APPROVAL_FORBIDDEN")

    def test_cancel_by_requester(self):
        req = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=self.target_id,
            user=self.user,
            document_number="CUST-CANCEL",
        )
        cancelled = cancel_request(approval=req, user=self.user, reason="no longer needed")
        self.assertEqual(cancelled.status, ApprovalStatus.CANCELLED)

    def test_cancel_audited(self):
        """cancel_request must write an audit log entry (same as approve/reject)."""
        req = request_approval(
            company=self.company,
            module_code="crm",
            target_type="crm.Customer",
            target_id=self.target_id,
            user=self.user,
            document_number="CUST-CANCEL-AUDIT",
        )
        cancel_request(approval=req, user=self.user, reason="test cancel audit")
        audit = AuditLog.objects.filter(
            module="crm",
            model_name="ApprovalRequest",
            action="cancel",
            object_id=str(req.id),
        )
        self.assertTrue(audit.exists(), "cancel_request must produce an audit log entry")
        self.assertEqual(audit.first().reason, "test cancel audit")


class ApprovalApiTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap API", legal_name="EcoWrap API Pvt")
        self.other = Company.objects.create(name="Other API", legal_name="Other API Ltd")
        self.branch = Branch.objects.create(company=self.company, code="API1", name="API")
        for code in ("crm", "workflow"):
            Module.objects.get_or_create(code=code, defaults={"name": code.title()})
        role = Role.objects.create(code="mgr", name="Manager")
        for mod in Module.objects.filter(code__in=["crm", "workflow"]):
            for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.APPROVE, Action.REJECT):
                RolePermission.objects.create(role=role, module=mod, action=action, is_allowed=True)
        self.user = User.objects.create_user(email="mgr@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=role, branch=self.branch)
        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_create_and_approve_via_api(self):
        tid = str(uuid.uuid4())
        create = self.client.post(
            reverse("approval-request-list"),
            {
                "company": str(self.company.id),
                "module_code": "crm",
                "target_type": "crm.Customer",
                "target_id": tid,
                "document_number": "CUST-API",
                "title": "Approve",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        approval_id = create.data["id"] if "id" in create.data else create.data["data"]["id"]
        approve = self.client.post(
            reverse("approval-request-approve", kwargs={"pk": approval_id}),
            {"reason": "ok"},
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        req = ApprovalRequest.objects.get(pk=approval_id)
        self.assertEqual(req.status, ApprovalStatus.APPROVED)

    def test_cross_company_approval_retrieve_blocked(self):
        foreign = ApprovalRequest.objects.create(
            company=self.other,
            module_code="crm",
            target_type="crm.Customer",
            target_id=uuid.uuid4(),
            status=ApprovalStatus.PENDING,
        )
        response = self.client.get(reverse("approval-request-detail", kwargs={"pk": foreign.pk}))
        self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
