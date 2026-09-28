"""
Phase 3 Slice B final hardening — SO PATCH disabled; line warehouse isolation.
"""

from decimal import Decimal

from django.urls import reverse
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.core.exceptions import ERPError
from apps.crm.models import Customer
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Branch, Company, Currency
from apps.sales.commercial import SalesOrderStatus
from apps.sales.so_services import add_so_line, create_sales_order
from apps.warehouse.models import Warehouse


class SliceBSalesPatchDisabledAPITests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap SOBH", legal_name="EcoWrap SOBH Pvt")
        self.branch = Branch.objects.create(company=self.company, code="SOBH1", name="SOBH Branch")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.customer = Customer.objects.create(
            company=self.company,
            code="CUS-SOBH",
            legal_name="Customer SOBH",
            trading_name="Customer SOBH",
            credit_limit=Decimal("100000"),
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-SOBH-001",
            name="FG SOBH",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-SOBH", name="WH SOBH")

        for code in ("sales", "purchase", "inventory"):
            Module.objects.get_or_create(code=code, defaults={"name": code.title()})
        role = Role.objects.create(code="sobh_ops", name="SOBH Ops")
        for mod in Module.objects.filter(code__in=["sales", "purchase", "inventory"]):
            for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE):
                RolePermission.objects.create(role=role, module=mod, action=action, is_allowed=True)
        self.user = User.objects.create_user(email="sobh@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=role, branch=self.branch)

        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

        self.so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            currency=self.npr,
            warehouse=self.warehouse,
            notes="so-original",
        )
        add_so_line(
            sales_order=self.so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("8"),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("12"),
        )

    def test_so_patch_method_not_allowed(self):
        ledger_before = StockLedgerEntry.objects.count()
        url = reverse("sales-order-typed-detail", kwargs={"pk": self.so.pk})
        response = self.client.patch(
            url,
            {
                "notes": "hacked via patch",
                "status": "INVOICED",
                "customer": str(self.customer.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.so.refresh_from_db()
        self.assertEqual(self.so.notes, "so-original")
        self.assertEqual(self.so.status, SalesOrderStatus.DRAFT)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)


class SoLineCompanyIsolationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap SOI", legal_name="EcoWrap SOI Pvt")
        self.other = Company.objects.create(name="Other SOI", legal_name="Other SOI Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.customer = Customer.objects.create(
            company=self.company,
            code="CUS-SOI",
            legal_name="Customer SOI",
            trading_name="Customer SOI",
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-SOI-001",
            name="FG SOI",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        self.wh = Warehouse.objects.create(company=self.company, code="WH-SOI", name="WH SOI")
        self.wh_other = Warehouse.objects.create(company=self.other, code="WH-SOX", name="WH SOX")
        self.user = User.objects.create_superuser(email="soi@ecowrap.com", password="Str0ng!Passw0rd")

    def test_cross_company_so_line_warehouse_rejected(self):
        so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            currency=self.npr,
        )
        ledger_before = StockLedgerEntry.objects.count()
        with self.assertRaises(ERPError) as ctx:
            add_so_line(
                sales_order=so,
                item=self.item,
                uom=self.kg,
                ordered_quantity=Decimal("3"),
                user=self.user,
                warehouse=self.wh_other,
            )
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")
        self.assertEqual(so.lines.count(), 0)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)

    def test_same_company_so_line_warehouse_ok(self):
        so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            currency=self.npr,
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("3"),
            user=self.user,
            warehouse=self.wh,
        )
        self.assertEqual(line.warehouse_id, self.wh.id)
