"""Reproducible smoke checks for the Task 1 canonical API surface."""

from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.crm.models import Customer
from apps.inventory.models import InventoryLot, Item, ItemType, LotStatus, UnitOfMeasure
from apps.organization.models import Branch, Company, Currency
from apps.procurement.commercial import PurchaseOrder
from apps.procurement.inbound import GateEntry, GoodsReceiptNote
from apps.procurement.models import Incoterm, Supplier
from apps.quality.qc import QCInspection
from apps.sales.commercial import DispatchNote, SalesInvoice, SalesOrder
from apps.warehouse.models import Warehouse


class Task1CanonicalApiReviewTests(APITestCase):
    canonical_routes = (
        "/api/v1/purchase/vendors/",
        "/api/v1/crm/customer-masters/",
        "/api/v1/inventory/items/",
        "/api/v1/warehouse/facilities/",
        "/api/v1/purchase/purchase-orders/",
        "/api/v1/purchase/inbound-gates/",
        "/api/v1/purchase/goods-receipts/",
        "/api/v1/quality/lot-inspections/",
        "/api/v1/inventory/lots/",
        "/api/v1/sales/sales-orders/",
        "/api/v1/sales/dispatch-notes/",
        "/api/v1/sales/sales-invoices/",
    )

    def _create_company(self, suffix):
        company = Company.objects.create(
            name=f"Task 1 Company {suffix}",
            legal_name=f"Task 1 Company {suffix} Pvt Ltd",
        )
        branch = Branch.objects.create(
            company=company,
            code=f"TASK1-{suffix}",
            name=f"Task 1 Branch {suffix}",
        )
        return {"company": company, "branch": branch}

    def _create_company_pair(self):
        company_a = self._create_company("A")
        company_b = self._create_company("B")

        self.role = Role.objects.create(code="task1-reviewer", name="Task 1 Reviewer")
        for module_code in (
            "crm",
            "inventory",
            "procurement",
            "purchase",
            "quality",
            "sales",
            "warehouse",
        ):
            module = Module.objects.create(code=module_code, name=module_code.title())
            for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE):
                RolePermission.objects.create(
                    role=self.role,
                    module=module,
                    action=action,
                    is_allowed=True,
                )

        user_a = User.objects.create_user(
            email="task1-company-a@example.com",
            password="******",
        )
        UserRole.objects.create(
            user=user_a,
            role=self.role,
            branch=company_a["branch"],
        )

        return {
            "a": company_a,
            "b": company_b,
            "user_a": user_a,
            "role": self.role,
        }

    def setUp(self):
        fixture = self._create_company_pair()
        self.company_a = fixture["a"]["company"]
        self.branch_a = fixture["a"]["branch"]
        self.company_b = fixture["b"]["company"]
        self.branch_b = fixture["b"]["branch"]
        self.user = fixture["user_a"]
        self.role = fixture["role"]
        self.npr, _ = Currency.objects.get_or_create(
            code="NPR",
            defaults={"name": "Nepalese Rupee"},
        )
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG",
            defaults={"name": "Kilogram", "is_base_weight": True},
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB",
            defaults={"name": "Free On Board", "version": "2020"},
        )
        self.supplier_a = Supplier.objects.create(
            company=self.company_a,
            code="TASK1-SUP-A",
            legal_name="Task 1 Supplier A",
            trading_name="Supplier A",
            currency=self.npr,
            preferred_incoterm=self.fob,
        )
        self.supplier_b = Supplier.objects.create(
            company=self.company_b,
            code="TASK1-SUP-B",
            legal_name="Task 1 Supplier B",
            trading_name="Supplier B",
            currency=self.npr,
            preferred_incoterm=self.fob,
        )
        self.customer_a = Customer.objects.create(
            company=self.company_a,
            code="TASK1-CUS-A",
            legal_name="Task 1 Customer A",
            trading_name="Customer A",
            currency=self.npr,
            credit_limit=Decimal("1000000"),
        )
        self.customer_b = Customer.objects.create(
            company=self.company_b,
            code="TASK1-CUS-B",
            legal_name="Task 1 Customer B",
            trading_name="Customer B",
            currency=self.npr,
            credit_limit=Decimal("1000000"),
        )
        self.item_a = self._create_item(self.company_a, "A")
        self.item_b = self._create_item(self.company_b, "B")
        self.warehouse_a = Warehouse.objects.create(
            company=self.company_a,
            code="TASK1-WH-A",
            name="Task 1 Warehouse A",
        )
        self.warehouse_b = Warehouse.objects.create(
            company=self.company_b,
            code="TASK1-WH-B",
            name="Task 1 Warehouse B",
        )

    def _create_item(self, company, suffix):
        return Item.objects.create(
            company=company,
            sku=f"TASK1-ITEM-{suffix}",
            name=f"Task 1 Item {suffix}",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )

    @staticmethod
    def _response_rows(response):
        payload = response.data.get("data", response.data)
        return payload if isinstance(payload, list) else []

    def test_docs_and_schema_are_available(self):
        self.assertEqual(self.client.get("/api/docs/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/schema/").status_code, status.HTTP_200_OK)

    def test_canonical_routes_require_authentication(self):
        for route in self.canonical_routes:
            with self.subTest(route=route):
                self.assertEqual(self.client.get(route).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_scoped_authenticated_user_can_read_every_canonical_route(self):
        self.client.force_authenticate(user=self.user)

        for route in self.canonical_routes:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIn("data", response.data)

    def test_canonical_list_responses_use_data_envelope(self):
        self.client.force_authenticate(user=self.user)

        for route in self.canonical_routes:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIsInstance(response.data, dict)
                self.assertIn("data", response.data)

    def test_empty_create_payload_is_rejected_without_creating_data(self):
        self.client.force_authenticate(user=self.user)

        for route in self.canonical_routes:
            with self.subTest(route=route):
                response = self.client.post(route, {}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIsInstance(response.data, dict)
                self.assertIn("error", response.data)
                self.assertIn("code", response.data["error"])
                self.assertIn("message", response.data["error"])
                self.assertIn("fields", response.data["error"])

    def test_company_a_cannot_see_company_b_master_records(self):
        self.client.force_authenticate(user=self.user)
        checks = (
            ("/api/v1/purchase/vendors/", self.supplier_a.id, self.supplier_b.id),
            ("/api/v1/crm/customer-masters/", self.customer_a.id, self.customer_b.id),
            ("/api/v1/inventory/items/", self.item_a.id, self.item_b.id),
            ("/api/v1/warehouse/facilities/", self.warehouse_a.id, self.warehouse_b.id),
        )

        for route, own_id, foreign_id in checks:
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                ids = {str(row["id"]) for row in self._response_rows(response)}
                self.assertIn(str(own_id), ids)
                self.assertNotIn(str(foreign_id), ids)

    def test_company_a_cannot_retrieve_update_or_delete_company_b_masters(self):
        self.client.force_authenticate(user=self.user)
        checks = (
            ("/api/v1/purchase/vendors/", self.supplier_b, "Supplier B"),
            ("/api/v1/crm/customer-masters/", self.customer_b, "Task 1 Customer B"),
            ("/api/v1/inventory/items/", self.item_b, "Task 1 Item B"),
            ("/api/v1/warehouse/facilities/", self.warehouse_b, "Task 1 Warehouse B"),
        )

        for route, record, original_name in checks:
            with self.subTest(route=route):
                detail = f"{route}{record.id}/"
                get_response = self.client.get(detail)
                self.assertIn(get_response.status_code, (403, 404))

                patch_response = self.client.patch(
                    detail,
                    {"name": "Company A must not change this"},
                    format="json",
                )
                self.assertIn(patch_response.status_code, (403, 404))

                delete_response = self.client.delete(detail)
                self.assertIn(delete_response.status_code, (403, 404))

                record.refresh_from_db()
                self.assertTrue(record.is_active)
                if hasattr(record, "name"):
                    self.assertEqual(record.name, original_name)

    def test_company_b_references_are_rejected_when_creating_company_a_item(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/inventory/items/",
            {
                "company": str(self.company_a.id),
                "sku": "TASK1-CROSS-COMPANY",
                "name": "Invalid cross-company item",
                "item_type": ItemType.FINISHED_GOOD,
                "base_uom": str(self.kg.id),
                "purchase_uom": str(self.kg.id),
                "stock_uom": str(self.kg.id),
                "preferred_supplier": str(self.supplier_b.id),
            },
            format="json",
        )
        self.assertIn(response.status_code, (400, 403))
        self.assertFalse(Item.objects.filter(sku="TASK1-CROSS-COMPANY").exists())

    def test_company_b_typed_transaction_ids_are_not_accessible(self):
        """Every typed transactional endpoint must apply the company scope to IDs."""
        po = PurchaseOrder.objects.create(
            company=self.company_b,
            document_number="TASK1-PO-B",
            supplier=self.supplier_b,
            currency=self.npr,
        )
        gate = GateEntry.objects.create(
            company=self.company_b,
            gate_entry_number="TASK1-GATE-B",
            entry_at=timezone.now(),
            supplier=self.supplier_b,
            purchase_order=po,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company_b,
            grn_number="TASK1-GRN-B",
            gate_entry=gate,
            supplier=self.supplier_b,
            warehouse=self.warehouse_b,
            received_at=timezone.now(),
            currency=self.npr,
        )
        lot = InventoryLot.objects.create(
            company=self.company_b,
            lot_number="TASK1-LOT-B",
            item=self.item_b,
            supplier=self.supplier_b,
            source_grn=grn,
            warehouse=self.warehouse_b,
            status=LotStatus.QC_HOLD,
            uom=self.kg,
            initial_quantity=Decimal("10"),
            remaining_quantity=Decimal("10"),
        )
        inspection = QCInspection.objects.create(
            company=self.company_b,
            inspection_number="TASK1-QC-B",
            grn=grn,
            lot=lot,
            item=self.item_b,
        )
        sales_order = SalesOrder.objects.create(
            company=self.company_b,
            document_number="TASK1-SO-B",
            customer=self.customer_b,
            currency=self.npr,
            warehouse=self.warehouse_b,
        )
        dispatch = DispatchNote.objects.create(
            company=self.company_b,
            document_number="TASK1-DISPATCH-B",
            sales_order=sales_order,
            warehouse=self.warehouse_b,
        )
        invoice = SalesInvoice.objects.create(
            company=self.company_b,
            document_number="TASK1-INVOICE-B",
            customer=self.customer_b,
            sales_order=sales_order,
            dispatch_note=dispatch,
            currency=self.npr,
        )

        self.client.force_authenticate(user=self.user)
        checks = (
            ("/api/v1/purchase/purchase-orders/", po),
            ("/api/v1/purchase/inbound-gates/", gate),
            ("/api/v1/purchase/goods-receipts/", grn),
            ("/api/v1/quality/lot-inspections/", inspection),
            ("/api/v1/inventory/lots/", lot),
            ("/api/v1/sales/sales-orders/", sales_order),
            ("/api/v1/sales/dispatch-notes/", dispatch),
            ("/api/v1/sales/sales-invoices/", invoice),
        )
        for route, record in checks:
            with self.subTest(route=route):
                list_response = self.client.get(route)
                self.assertEqual(list_response.status_code, status.HTTP_200_OK)
                listed_ids = {str(row["id"]) for row in self._response_rows(list_response)}
                self.assertNotIn(str(record.id), listed_ids)

                detail_response = self.client.get(f"{route}{record.id}/")
                self.assertIn(detail_response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_auth_login_issues_a_token_for_review_user(self):
        response = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "******"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])
