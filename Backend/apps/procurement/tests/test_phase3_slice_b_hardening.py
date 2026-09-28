"""
Phase 3 Slice B final hardening — no generic PATCH; line company isolation.
"""

from decimal import Decimal

from django.urls import reverse
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Branch, Company, Currency
from apps.procurement.commercial import PurchaseOrderStatus
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    amend_purchase_order,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.warehouse.models import Warehouse


class SliceBPatchDisabledAPITests(APITestCase):
    """Generic PATCH must not mutate typed commercial docs."""

    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap HB", legal_name="EcoWrap HB Pvt")
        self.branch = Branch.objects.create(company=self.company, code="HB1", name="HB Branch")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-HB",
            legal_name="Supplier HB",
            trading_name="Supplier HB",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-HB-001",
            name="RM HB",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-HB", name="WH HB")

        for code in ("purchase", "sales", "inventory", "procurement"):
            Module.objects.get_or_create(code=code, defaults={"name": code.title()})
        role = Role.objects.create(code="hb_ops", name="HB Ops")
        for mod in Module.objects.filter(code__in=["purchase", "sales", "inventory", "procurement"]):
            for action in (Action.VIEW, Action.CREATE, Action.EDIT, Action.DELETE):
                RolePermission.objects.create(role=role, module=mod, action=action, is_allowed=True)
        self.user = User.objects.create_user(email="hb@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=role, branch=self.branch)

        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

        self.po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
            destination_warehouse=self.warehouse,
            notes="original",
        )
        add_po_line(
            purchase_order=self.po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("10"),
            user=self.user,
            unit_price=Decimal("5"),
        )
        submit_purchase_order(purchase_order=self.po, user=self.user)
        approve_purchase_order(purchase_order=self.po, user=self.user)
        self.po.refresh_from_db()

    def test_po_patch_method_not_allowed(self):
        ledger_before = StockLedgerEntry.objects.count()
        url = reverse("purchase-order-typed-detail", kwargs={"pk": self.po.pk})
        response = self.client.patch(url, {"notes": "hacked via patch", "status": "CLOSED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.po.refresh_from_db()
        self.assertEqual(self.po.notes, "original")
        self.assertEqual(self.po.status, PurchaseOrderStatus.APPROVED)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)

    def test_po_amend_still_works(self):
        amend_purchase_order(purchase_order=self.po, user=self.user, notes="via amend")
        self.po.refresh_from_db()
        self.assertEqual(self.po.notes, "via amend")

    def test_supplier_bill_patch_method_not_allowed(self):
        from apps.procurement.bill_services import create_supplier_bill

        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="HB-BILL-1",
            user=self.user,
            currency=self.npr,
            notes="bill-original",
        )
        ledger_before = StockLedgerEntry.objects.count()
        url = reverse("supplier-bill-typed-detail", kwargs={"pk": bill.pk})
        response = self.client.patch(
            url,
            {"notes": "hacked", "status": "POSTED", "commercials_frozen": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        bill.refresh_from_db()
        self.assertEqual(bill.notes, "bill-original")
        self.assertEqual(bill.status, "DRAFT")
        self.assertFalse(bill.commercials_frozen)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)


class PoLineCompanyIsolationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap Isol", legal_name="EcoWrap Isol Pvt")
        self.other = Company.objects.create(name="Other Isol", legal_name="Other Isol Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-IS",
            legal_name="Supplier IS",
            trading_name="Supplier IS",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-IS-001",
            name="RM IS",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
        )
        self.wh = Warehouse.objects.create(company=self.company, code="WH-IS", name="WH IS")
        self.wh_other = Warehouse.objects.create(company=self.other, code="WH-XO", name="WH XO")
        self.user = User.objects.create_superuser(email="isol@ecowrap.com", password="Str0ng!Passw0rd")

    def test_cross_company_po_line_destination_warehouse_rejected(self):
        po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
        )
        ledger_before = StockLedgerEntry.objects.count()
        with self.assertRaises(ERPError) as ctx:
            add_po_line(
                purchase_order=po,
                item=self.item,
                uom=self.kg,
                ordered_quantity=Decimal("5"),
                user=self.user,
                destination_warehouse=self.wh_other,
            )
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")
        self.assertEqual(po.lines.count(), 0)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)

    def test_same_company_po_line_destination_warehouse_ok(self):
        po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
        )
        line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("5"),
            user=self.user,
            destination_warehouse=self.wh,
        )
        self.assertEqual(line.destination_warehouse_id, self.wh.id)
