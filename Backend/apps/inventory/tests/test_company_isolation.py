"""
Multi-company isolation API tests for Phase 1 typed masters.

Company A users must not list/retrieve/create/update/delete or reference Company B data.
"""

from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.inventory.models import Item, ItemType, LandedCostDocument, UnitOfMeasure
from apps.organization.models import Branch, Company, Currency, TaxCategory
from apps.procurement.models import Supplier
from apps.warehouse.models import Warehouse


class MultiCompanyIsolationAPITests(APITestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Company A", legal_name="Company A Pvt Ltd")
        self.company_b = Company.objects.create(name="Company B", legal_name="Company B Pvt Ltd")
        self.branch_a = Branch.objects.create(company=self.company_a, code="A1", name="Branch A")
        self.branch_b = Branch.objects.create(company=self.company_b, code="B1", name="Branch B")

        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(code="KG", defaults={"name": "Kilogram"})

        for code in ("inventory", "procurement", "warehouse", "crm", "organization"):
            Module.objects.get_or_create(code=code, defaults={"name": code.title()})

        self.role_a = Role.objects.create(code="company_a_ops", name="Company A Ops")
        for mod in Module.objects.filter(
            code__in=["inventory", "procurement", "warehouse", "crm", "organization"]
        ):
            for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE):
                RolePermission.objects.create(role=self.role_a, module=mod, action=action, is_allowed=True)

        self.user_a = User.objects.create_user(email="usera@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user_a, role=self.role_a, branch=self.branch_a)

        # Seed Company B data (as if another tenant already owns it)
        self.supplier_b = Supplier.objects.create(
            company=self.company_b, code="SUP-B", legal_name="Supplier B Ltd", trading_name="Supplier B"
        )
        self.item_b = Item.objects.create(
            company=self.company_b,
            sku="RM-B-001",
            name="Company B Item",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        self.warehouse_b = Warehouse.objects.create(
            company=self.company_b, code="WH-B", name="Warehouse B"
        )
        self.tax_b = TaxCategory.objects.create(company=self.company_b, code="VAT-B", name="VAT B")
        self.lcdoc_b = LandedCostDocument.objects.create(
            company=self.company_b,
            document_number="LC-B-001",
            currency=self.npr,
            purchase_quantity=Decimal("10"),
            purchase_unit_cost=Decimal("100"),
            purchase_value=Decimal("1000"),
        )

        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user_a.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def _ids(self, response):
        payload = response.data.get("data", response.data)
        if isinstance(payload, list):
            return {str(row["id"]) for row in payload}
        return set()

    def test_list_items_excludes_other_company(self):
        Item.objects.create(
            company=self.company_a,
            sku="RM-A-001",
            name="Company A Item",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        response = self.client.get(reverse("item-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids(response)
        self.assertIn(str(Item.objects.get(sku="RM-A-001").id), ids)
        self.assertNotIn(str(self.item_b.id), ids)

    def test_retrieve_other_company_item_forbidden_or_not_found(self):
        response = self.client.get(reverse("item-detail", args=[self.item_b.id]))
        self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

    def test_create_item_for_other_company_rejected(self):
        response = self.client.post(
            reverse("item-list"),
            {
                "company": str(self.company_b.id),
                "sku": "HACK-B",
                "name": "Should Fail",
                "item_type": ItemType.RAW_MATERIAL,
                "base_uom": str(self.kg.id),
                "purchase_uom": str(self.kg.id),
                "stock_uom": str(self.kg.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Item.objects.filter(sku="HACK-B").exists())

    def test_update_other_company_item_rejected(self):
        response = self.client.patch(
            reverse("item-detail", args=[self.item_b.id]),
            {"name": "Hacked"},
            format="json",
        )
        self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.name, "Company B Item")

    def test_delete_other_company_item_rejected(self):
        response = self.client.delete(reverse("item-detail", args=[self.item_b.id]))
        self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))
        self.item_b.refresh_from_db()
        self.assertTrue(self.item_b.is_active)

    def test_cross_company_preferred_supplier_reference_rejected(self):
        response = self.client.post(
            reverse("item-list"),
            {
                "company": str(self.company_a.id),
                "sku": "RM-A-XREF",
                "name": "Bad Ref",
                "item_type": ItemType.RAW_MATERIAL,
                "base_uom": str(self.kg.id),
                "purchase_uom": str(self.kg.id),
                "stock_uom": str(self.kg.id),
                "preferred_supplier": str(self.supplier_b.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Item.objects.filter(sku="RM-A-XREF").exists())

    def test_vendor_list_and_create_isolation(self):
        Supplier.objects.create(
            company=self.company_a, code="SUP-A", legal_name="Supplier A", trading_name="Supplier A"
        )
        listed = self.client.get(reverse("vendor-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        ids = self._ids(listed)
        self.assertNotIn(str(self.supplier_b.id), ids)

        create_b = self.client.post(
            reverse("vendor-list"),
            {
                "company": str(self.company_b.id),
                "code": "SUP-HACK",
                "legal_name": "Hack Supplier",
            },
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

        get_b = self.client.get(reverse("vendor-detail", args=[self.supplier_b.id]))
        self.assertIn(get_b.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

    def test_warehouse_facility_isolation(self):
        Warehouse.objects.create(company=self.company_a, code="WH-A", name="Warehouse A")
        listed = self.client.get(reverse("facility-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.warehouse_b.id), self._ids(listed))

        create_b = self.client.post(
            reverse("facility-list"),
            {"company": str(self.company_b.id), "code": "WH-HACK", "name": "Hack WH"},
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_master_isolation(self):
        from apps.crm.models import Customer

        cust_b = Customer.objects.create(
            company=self.company_b, code="CUS-B", legal_name="Customer B"
        )
        listed = self.client.get(reverse("customer-master-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(cust_b.id), self._ids(listed))

        create_b = self.client.post(
            reverse("customer-master-list"),
            {
                "company": str(self.company_b.id),
                "code": "CUS-HACK",
                "legal_name": "Hack Customer",
            },
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

    def test_lot_isolation(self):
        create_b = self.client.post(
            reverse("inventory-lot-list"),
            {
                "company": str(self.company_b.id),
                "lot_number": "LOT-HACK",
                "item": str(self.item_b.id),
                "uom": str(self.kg.id),
                "initial_quantity": "10",
                "remaining_quantity": "10",
                "purchase_unit_cost": "100",
            },
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

    def test_landed_cost_document_and_preview_isolation(self):
        listed = self.client.get(reverse("landed-cost-document-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.lcdoc_b.id), self._ids(listed))

        preview = self.client.post(
            reverse("landed-cost-document-preview", args=[self.lcdoc_b.id]), {}, format="json"
        )
        self.assertIn(preview.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

        create_b = self.client.post(
            reverse("landed-cost-document-list"),
            {
                "company": str(self.company_b.id),
                "document_number": "LC-HACK",
                "currency": str(self.npr.id),
                "purchase_quantity": "1",
                "purchase_unit_cost": "1",
            },
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

    def test_tax_category_isolation(self):
        listed = self.client.get(reverse("tax-category-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.tax_b.id), self._ids(listed))

        create_b = self.client.post(
            reverse("tax-category-list"),
            {"company": str(self.company_b.id), "code": "HACK", "name": "Hack Tax"},
            format="json",
        )
        self.assertEqual(create_b.status_code, status.HTTP_403_FORBIDDEN)

    def test_company_list_only_own_company(self):
        listed = self.client.get(reverse("company-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        ids = self._ids(listed)
        self.assertIn(str(self.company_a.id), ids)
        self.assertNotIn(str(self.company_b.id), ids)

    def test_same_company_create_still_allowed(self):
        response = self.client.post(
            reverse("item-list"),
            {
                "company": str(self.company_a.id),
                "sku": "RM-A-OK",
                "name": "Allowed Item",
                "item_type": ItemType.RAW_MATERIAL,
                "base_uom": str(self.kg.id),
                "purchase_uom": str(self.kg.id),
                "stock_uom": str(self.kg.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Item.objects.filter(sku="RM-A-OK", company=self.company_a).exists())

    def test_domainrecord_products_route_still_reachable(self):
        """Compatibility: DomainRecord inventory products route must remain registered."""
        response = self.client.get(reverse("products-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
