"""
Phase B â€” typed CRM + company isolation + RBAC regression tests.
"""

from decimal import Decimal

from django.urls import reverse
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.core.exceptions import ERPError
from apps.crm.models import Contact, ContactParty, CrmActivity, Customer
from apps.crm.services import (
    CrmError,
    create_activity,
    create_contact,
    create_customer,
    update_contact,
    update_customer,
)
from apps.organization.models import Branch, Company, Currency
from apps.procurement.models import Incoterm, Supplier


class CrmServiceIsolationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap CRM", legal_name="EcoWrap CRM Pvt")
        self.other = Company.objects.create(name="Other CRM", legal_name="Other CRM Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.user = User.objects.create_superuser(email="crm@ecowrap.com", password="Str0ng!Passw0rd")
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )

    def test_customer_create_update_deactivate(self):
        c = create_customer(
            company=self.company,
            code="CUST-B1",
            legal_name="Buyer One",
            user=self.user,
            email="buyer@example.com",
            credit_limit=Decimal("100000"),
        )
        self.assertEqual(c.code, "CUST-B1")
        updated = update_customer(customer=c, user=self.user, trading_name="Buyer 1")
        self.assertEqual(updated.trading_name, "Buyer 1")

    def test_duplicate_code_rejected(self):
        create_customer(
            company=self.company, code="CUST-DUP", legal_name="A", user=self.user
        )
        with self.assertRaises(CrmError) as ctx:
            create_customer(
                company=self.company, code="CUST-DUP", legal_name="B", user=self.user
            )
        self.assertEqual(ctx.exception.code, "DUPLICATE_CODE")

    def test_cross_company_contact_rejected(self):
        cust = create_customer(
            company=self.company, code="CUST-XC", legal_name="Local", user=self.user
        )
        with self.assertRaises(ERPError) as ctx:
            create_contact(
                company=self.other,
                name="Spy",
                user=self.user,
                customer=cust,
            )
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")

    def test_cross_company_supplier_contact_rejected(self):
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-XC",
            legal_name="Local Sup",
            trading_name="Local Sup",
            preferred_incoterm=self.fob,
        )
        with self.assertRaises(ERPError):
            create_contact(
                company=self.other,
                name="Spy",
                user=self.user,
                supplier=supplier,
            )
    def test_customer_contact_requires_customer_and_rejects_supplier(self):
        customer = create_customer(
            company=self.company,
            code="CUST-CONTACT",
            legal_name="Customer Contact",
            user=self.user,
        )
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CONTACT",
            legal_name="Supplier Contact",
            trading_name="Supplier Contact",
            preferred_incoterm=self.fob,
        )

        contact = create_contact(
            company=self.company,
            name="Customer Contact Person",
            user=self.user,
            party_kind=ContactParty.CUSTOMER,
            customer=customer,
        )
        self.assertEqual(contact.party_kind, ContactParty.CUSTOMER)
        self.assertEqual(contact.customer_id, customer.id)
        self.assertIsNone(contact.supplier_id)

        with self.assertRaises(CrmError) as ctx:
            create_contact(
                company=self.company,
                name="Invalid Customer Contact",
                user=self.user,
                party_kind=ContactParty.CUSTOMER,
                supplier=supplier,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

    def test_supplier_contact_requires_supplier_and_rejects_customer(self):
        customer = create_customer(
            company=self.company,
            code="CUST-SUP-CONTACT",
            legal_name="Customer",
            user=self.user,
        )
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-SUP-CONTACT",
            legal_name="Supplier",
            trading_name="Supplier",
            preferred_incoterm=self.fob,
        )

        contact = create_contact(
            company=self.company,
            name="Supplier Contact Person",
            user=self.user,
            party_kind=ContactParty.SUPPLIER,
            supplier=supplier,
        )
        self.assertEqual(contact.party_kind, ContactParty.SUPPLIER)
        self.assertEqual(contact.supplier_id, supplier.id)
        self.assertIsNone(contact.customer_id)

        with self.assertRaises(CrmError) as ctx:
            create_contact(
                company=self.company,
                name="Invalid Supplier Contact",
                user=self.user,
                party_kind=ContactParty.SUPPLIER,
                customer=customer,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

    def test_customer_contact_cannot_be_created_without_customer(self):
        with self.assertRaises(CrmError) as ctx:
            create_contact(
                company=self.company,
                name="Missing Customer",
                user=self.user,
                party_kind=ContactParty.CUSTOMER,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

    def test_supplier_contact_cannot_be_created_without_supplier(self):
        with self.assertRaises(CrmError) as ctx:
            create_contact(
                company=self.company,
                name="Missing Supplier",
                user=self.user,
                party_kind=ContactParty.SUPPLIER,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

    def test_contact_update_cannot_create_invalid_party_relationship(self):
        customer = create_customer(
            company=self.company,
            code="CUST-UPDATE",
            legal_name="Customer",
            user=self.user,
        )
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-UPDATE",
            legal_name="Supplier",
            trading_name="Supplier",
            preferred_incoterm=self.fob,
        )

        contact = create_contact(
            company=self.company,
            name="Existing Contact",
            user=self.user,
            party_kind=ContactParty.CUSTOMER,
            customer=customer,
        )

        with self.assertRaises(CrmError) as ctx:
            update_contact(
                contact=contact,
                user=self.user,
                party_kind=ContactParty.SUPPLIER,
                customer=None,
                supplier=None,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

        with self.assertRaises(CrmError) as ctx:
            update_contact(
                contact=contact,
                user=self.user,
                supplier=supplier,
            )
        self.assertEqual(ctx.exception.code, "INVALID_PARTY_RELATIONSHIP")

        contact.refresh_from_db()
        self.assertEqual(contact.party_kind, ContactParty.CUSTOMER)
        self.assertEqual(contact.customer_id, customer.id)
        self.assertIsNone(contact.supplier_id)

    def test_activity_contact_supplier_mismatch_rejected(self):
        supplier_a = Supplier.objects.create(
            company=self.company,
            code="SUP-ACT-A",
            legal_name="Supplier A",
            trading_name="Supplier A",
            preferred_incoterm=self.fob,
        )
        supplier_b = Supplier.objects.create(
            company=self.company,
            code="SUP-ACT-B",
            legal_name="Supplier B",
            trading_name="Supplier B",
            preferred_incoterm=self.fob,
        )

        contact = create_contact(
            company=self.company,
            name="Supplier Contact",
            user=self.user,
            party_kind=ContactParty.SUPPLIER,
            supplier=supplier_a,
        )

        with self.assertRaises(CrmError) as ctx:
            create_activity(
                company=self.company,
                subject="Invalid supplier activity",
                user=self.user,
                supplier=supplier_b,
                contact=contact,
                activity_type="CALL",
            )
        self.assertEqual(ctx.exception.code, "CONTACT_MISMATCH")

    def test_activity_create(self):
        cust = create_customer(
            company=self.company, code="CUST-ACT", legal_name="Act Co", user=self.user
        )
        act = create_activity(
            company=self.company,
            subject="Follow up",
            user=self.user,
            customer=cust,
            activity_type="CALL",
        )
        self.assertEqual(act.subject, "Follow up")
        self.assertEqual(CrmActivity.objects.filter(customer=cust).count(), 1)


class CrmApiIsolationTests(APITestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Company A", legal_name="A Ltd")
        self.company_b = Company.objects.create(name="Company B", legal_name="B Ltd")
        self.branch_a = Branch.objects.create(company=self.company_a, code="A1", name="Branch A")
        Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        role = Role.objects.create(code="crm_ops", name="CRM Ops")
        mod = Module.objects.get(code="crm")
        for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE):
            RolePermission.objects.create(role=role, module=mod, action=action, is_allowed=True)
        self.user_a = User.objects.create_user(email="usera@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user_a, role=role, branch=self.branch_a)

        self.cust_a = Customer.objects.create(
            company=self.company_a, code="CA-1", legal_name="Cust A"
        )
        self.cust_b = Customer.objects.create(
            company=self.company_b, code="CB-1", legal_name="Cust B"
        )

        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user_a.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_list_only_own_company(self):
        url = reverse("customer-master-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.data.get("data", response.data)
        rows = payload if isinstance(payload, list) else payload.get("results", payload)
        ids = {str(r["id"]) for r in rows}
        self.assertIn(str(self.cust_a.id), ids)
        self.assertNotIn(str(self.cust_b.id), ids)

    def test_cross_company_retrieve_blocked(self):
        url = reverse("customer-master-detail", kwargs={"pk": self.cust_b.pk})
        response = self.client.get(url)
        self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

    def test_unauthorized_create_blocked(self):
        viewer = User.objects.create_user(email="viewer@ecowrap.com", password="Str0ng!Passw0rd")
        role = Role.objects.create(code="crm_view", name="CRM View")
        RolePermission.objects.create(
            role=role,
            module=Module.objects.get(code="crm"),
            action=Action.VIEW,
            is_allowed=True,
        )
        UserRole.objects.create(user=viewer, role=role, branch=self.branch_a)
        login = self.client.post(
            reverse("auth-login"),
            {"email": viewer.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
        response = self.client.post(
            reverse("customer-master-list"),
            {
                "company": str(self.company_a.id),
                "code": "NOPE",
                "legal_name": "Nope",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_customer_ok(self):
        response = self.client.post(
            reverse("customer-master-list"),
            {
                "company": str(self.company_a.id),
                "code": "CA-NEW",
                "legal_name": "New Cust",
                "email": "new@example.com",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Customer.objects.filter(company=self.company_a, code="CA-NEW").exists())
