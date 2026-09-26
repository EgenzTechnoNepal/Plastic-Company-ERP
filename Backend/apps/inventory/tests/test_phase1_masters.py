"""
Phase 1 acceptance and negative tests for inventory foundation + costing masters.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.core.exceptions import InvalidStatusTransitionError
from apps.inventory.models import (
    AllocationBasis,
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    ItemType,
    LandedCostCategory,
    LandedCostDocument,
    LotStatus,
    UnitOfMeasure,
    UomConversion,
)
from apps.inventory.services import (
    LandedCostError,
    UomConversionError,
    convert_quantity,
    create_landed_component,
    preview_landed_cost,
    transition_lot_status,
    validate_allocation_basis,
)
from apps.organization.models import Company, Currency, ExchangeRate, TaxCategory, TaxRate
from apps.procurement.models import Incoterm, Supplier
from apps.warehouse.models import Bin, BinType, Rack, Warehouse, Zone


class Phase1BaseTestCase(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="EcoWrap Nepal", legal_name="EcoWrap Nepal Pvt. Ltd."
        )
        self.company_b = Company.objects.create(
            name="Other Co", legal_name="Other Co Pvt. Ltd."
        )
        self.npr, _ = Currency.objects.get_or_create(
            code="NPR", defaults={"name": "Nepalese Rupee", "symbol": "Rs"}
        )
        self.usd, _ = Currency.objects.get_or_create(
            code="USD", defaults={"name": "US Dollar", "symbol": "$"}
        )
        self._ensure_uoms()
        self.user = User.objects.create_superuser(
            email="phase1@ecowrap.com", password="Str0ng!Passw0rd"
        )
        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def _ensure_uoms(self):
        defs = [
            ("KG", "Kilogram", True),
            ("G", "Gram", False),
            ("TON", "Metric Ton", False),
            ("PCS", "Pieces", False),
            ("M", "Meter", False),
            ("L", "Litre", False),
        ]
        self.uoms = {}
        for code, name, base_w in defs:
            obj, _ = UnitOfMeasure.objects.get_or_create(
                code=code, defaults={"name": name, "is_base_weight": base_w}
            )
            self.uoms[code] = obj
        pairs = [
            ("KG", "G", Decimal("1000")),
            ("TON", "KG", Decimal("1000")),
            ("G", "KG", Decimal("0.001")),
            ("KG", "TON", Decimal("0.001")),
        ]
        for f, t, factor in pairs:
            UomConversion.objects.get_or_create(
                from_uom=self.uoms[f], to_uom=self.uoms[t], defaults={"factor": factor}
            )


class ItemMasterTests(Phase1BaseTestCase):
    def test_item_creation(self):
        item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
            created_by=self.user,
        )
        self.assertEqual(item.sku, "RM-PLA-001")
        self.assertTrue(item.created_at)
        self.assertEqual(item.created_by_id, self.user.id)

    def test_duplicate_sku_prevention(self):
        Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Item.objects.create(
                    company=self.company,
                    sku="RM-PLA-001",
                    name="PLA Dup",
                    item_type=ItemType.RAW_MATERIAL,
                    base_uom=self.uoms["KG"],
                    purchase_uom=self.uoms["KG"],
                    stock_uom=self.uoms["KG"],
                )

    def test_same_sku_different_company_ok(self):
        Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA A",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        Item.objects.create(
            company=self.company_b,
            sku="RM-PLA-001",
            name="PLA B",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        self.assertEqual(Item.objects.filter(sku="RM-PLA-001").count(), 2)


class UomConversionTests(Phase1BaseTestCase):
    def test_kg_to_g(self):
        result = convert_quantity(Decimal("1"), self.uoms["KG"], self.uoms["G"])
        self.assertEqual(result, Decimal("1000.000000"))

    def test_ton_to_kg(self):
        result = convert_quantity(Decimal("1"), self.uoms["TON"], self.uoms["KG"])
        self.assertEqual(result, Decimal("1000.000000"))

    def test_ton_to_g_via_hub(self):
        result = convert_quantity(Decimal("1"), self.uoms["TON"], self.uoms["G"])
        self.assertEqual(result, Decimal("1000000.000000"))

    def test_negative_quantity_rejected(self):
        with self.assertRaises(UomConversionError):
            convert_quantity(Decimal("-1"), self.uoms["KG"], self.uoms["G"])

    def test_invalid_conversion_path(self):
        with self.assertRaises(UomConversionError):
            convert_quantity(Decimal("1"), self.uoms["PCS"], self.uoms["KG"])


class SupplierAndIncotermTests(Phase1BaseTestCase):
    def test_supplier_creation(self):
        fob, _ = Incoterm.objects.get_or_create(
            code="FOB",
            defaults={"name": "Free On Board", "version": "2020"},
        )
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CN-A",
            legal_name="China Supplier A Co. Ltd.",
            trading_name="China Supplier A",
            country="China",
            currency=self.npr,
            preferred_incoterm=fob,
        )
        self.assertEqual(supplier.trading_name, "China Supplier A")
        self.assertEqual(supplier.preferred_incoterm.code, "FOB")

    def test_incoterm_creation(self):
        inc, created = Incoterm.objects.get_or_create(
            code="FOB",
            defaults={"name": "Free On Board", "version": "2020", "default_named_place": "Shanghai"},
        )
        if not created:
            Incoterm.objects.filter(pk=inc.pk).update(default_named_place="Shanghai Port")
            inc.refresh_from_db()
        self.assertEqual(inc.code, "FOB")
        self.assertTrue(inc.is_active)
        self.assertEqual(inc.version, "2020")


class WarehouseHierarchyTests(Phase1BaseTestCase):
    def test_warehouse_bin_hierarchy(self):
        wh = Warehouse.objects.create(company=self.company, code="WH-MAIN", name="Main Warehouse")
        zone = Zone.objects.create(warehouse=wh, code="Z-RM", name="Raw Material Zone")
        rack = Rack.objects.create(zone=zone, code="R-01", name="Rack 1")
        bin_obj = Bin.objects.create(
            warehouse=wh, zone=zone, rack=rack, code="BIN-RM-01", bin_type=BinType.RAW_MATERIAL
        )
        self.assertEqual(bin_obj.warehouse_id, wh.id)
        self.assertEqual(bin_obj.zone_id, zone.id)
        self.assertEqual(bin_obj.rack_id, rack.id)


class BatchLotTests(Phase1BaseTestCase):
    def setUp(self):
        super().setUp()
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CN-A",
            legal_name="China Supplier A Co. Ltd.",
            trading_name="China Supplier A",
        )

    def test_batch_creation(self):
        lot = InventoryLot.objects.create(
            company=self.company,
            lot_number="LOT-PLA-001",
            item=self.item,
            supplier=self.supplier,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("100"),
            remaining_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            currency=self.npr,
            status=LotStatus.RECEIVED,
        )
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000"))
        self.assertIsNone(lot.landed_unit_cost)

    def test_valid_status_transitions(self):
        lot = InventoryLot.objects.create(
            company=self.company,
            lot_number="LOT-T1",
            item=self.item,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("10"),
            remaining_quantity=Decimal("10"),
            status=LotStatus.RECEIVED,
        )
        transition_lot_status(lot, LotStatus.QC_HOLD)
        transition_lot_status(lot, LotStatus.AVAILABLE)
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

    def test_invalid_batch_transition(self):
        lot = InventoryLot.objects.create(
            company=self.company,
            lot_number="LOT-T2",
            item=self.item,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("10"),
            remaining_quantity=Decimal("10"),
            status=LotStatus.RECEIVED,
        )
        with self.assertRaises(InvalidStatusTransitionError):
            transition_lot_status(lot, LotStatus.AVAILABLE)

    def test_negative_quantity_constraint(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                InventoryLot.objects.create(
                    company=self.company,
                    lot_number="LOT-NEG",
                    item=self.item,
                    uom=self.uoms["KG"],
                    initial_quantity=Decimal("-1"),
                    remaining_quantity=Decimal("0"),
                )


class LandedCostTests(Phase1BaseTestCase):
    def setUp(self):
        super().setUp()
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        self.lot = InventoryLot.objects.create(
            company=self.company,
            lot_number="LOT-LC-001",
            item=self.item,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("100"),
            remaining_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            currency=self.npr,
        )
        self.doc = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LC-001",
            lot=self.lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )

    def test_landed_cost_component_creation(self):
        c = create_landed_component(
            self.doc,
            category=LandedCostCategory.INTERNATIONAL_FREIGHT,
            amount=Decimal("10000"),
            currency=self.npr,
            exchange_rate=Decimal("1"),
            allocation_basis=AllocationBasis.VALUE,
        )
        self.assertEqual(c.base_currency_amount, Decimal("10000.0000"))

    def test_acceptance_landed_cost_preview(self):
        """100 KG × NPR 1000 + freight/insurance/customs/clearing/Nepal transport."""
        costs = [
            (LandedCostCategory.INTERNATIONAL_FREIGHT, Decimal("10000")),
            (LandedCostCategory.INSURANCE, Decimal("2000")),
            (LandedCostCategory.CUSTOMS_DUTY, Decimal("8000")),
            (LandedCostCategory.CLEARING, Decimal("3000")),
            (LandedCostCategory.NEPAL_TRANSPORT, Decimal("5000")),
        ]
        for cat, amt in costs:
            create_landed_component(
                self.doc, category=cat, amount=amt, currency=self.npr, exchange_rate=Decimal("1")
            )

        preview = preview_landed_cost(self.doc)
        self.assertEqual(preview["purchase_value"], "100000.0000")
        self.assertEqual(preview["additional_costs_total"], "28000.0000")
        self.assertEqual(preview["landed_total"], "128000.0000")
        self.assertEqual(preview["landed_unit_cost"], "1280.000000")
        # Purchase unit cost on lot unchanged
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.purchase_unit_cost, Decimal("1000"))
        self.assertEqual(len(preview["components"]), 5)

    def test_allocation_basis_validation(self):
        validate_allocation_basis(AllocationBasis.WEIGHT)
        with self.assertRaises(LandedCostError):
            validate_allocation_basis("INVALID")

    def test_invalid_cost_allocation_basis_on_create(self):
        with self.assertRaises(LandedCostError):
            create_landed_component(
                self.doc,
                category=LandedCostCategory.OTHER_DIRECT_COST,
                amount=Decimal("100"),
                currency=self.npr,
                allocation_basis="BOGUS",
            )

    def test_decimal_money_handling(self):
        c = create_landed_component(
            self.doc,
            category=LandedCostCategory.BANK_CHARGES,
            amount=Decimal("123.4567"),
            currency=self.usd,
            exchange_rate=Decimal("133.25"),
        )
        self.assertIsInstance(c.base_currency_amount, Decimal)
        # 123.4567 × 133.25 = 16450.605275 → ROUND_HALF_UP to 4 dp
        self.assertEqual(c.base_currency_amount, Decimal("16450.6053"))
        # Must never be float
        self.assertFalse(isinstance(c.base_currency_amount, float))

    def test_invalid_exchange_rate(self):
        with self.assertRaises(LandedCostError):
            create_landed_component(
                self.doc,
                category=LandedCostCategory.VAT,
                amount=Decimal("10"),
                currency=self.usd,
                exchange_rate=Decimal("0"),
            )


class CurrencyTaxTests(Phase1BaseTestCase):
    def test_exchange_rate_handling(self):
        rate = ExchangeRate.objects.create(
            currency_code="USD", rate_to_base=Decimal("133.250000"), as_of_date=date(2026, 9, 1)
        )
        self.assertEqual(rate.rate_to_base, Decimal("133.250000"))

    def test_tax_category_configurable(self):
        cat = TaxCategory.objects.create(company=self.company, code="STD", name="Standard")
        tax = TaxRate.objects.create(
            company=self.company,
            tax_category=cat,
            name="Configurable VAT",
            rate_percent=Decimal("13.0000"),
            effective_from=date(2026, 1, 1),
        )
        self.assertEqual(tax.rate_percent, Decimal("13.0000"))


class FifoFoundationTests(Phase1BaseTestCase):
    def test_receipt_layer_preserves_costs(self):
        item = Item.objects.create(
            company=self.company,
            sku="RM-X",
            name="X",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
        )
        lot = InventoryLot.objects.create(
            company=self.company,
            lot_number="LOT-FIFO-1",
            item=item,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("50"),
            remaining_quantity=Decimal("50"),
            purchase_unit_cost=Decimal("1000"),
        )
        layer = InventoryReceiptLayer.objects.create(
            company=self.company,
            lot=lot,
            item=item,
            received_at=datetime.now(timezone.utc),
            receipt_sequence=1,
            uom=self.uoms["KG"],
            initial_quantity=Decimal("50"),
            remaining_quantity=Decimal("50"),
            purchase_unit_cost=Decimal("1000"),
            landed_unit_cost=Decimal("1280"),
            currency=self.npr,
        )
        self.assertEqual(layer.purchase_unit_cost, Decimal("1000"))
        self.assertEqual(layer.landed_unit_cost, Decimal("1280"))
        self.assertEqual(layer.reserved_quantity, Decimal("0"))


class ApiSerializationTests(Phase1BaseTestCase):
    def test_item_api_create_list_retrieve_update_deactivate(self):
        create = self.client.post(
            reverse("item-list"),
            {
                "company": str(self.company.id),
                "sku": "RM-PLA-API",
                "name": "PLA Raw Material",
                "item_type": ItemType.RAW_MATERIAL,
                "base_uom": str(self.uoms["KG"].id),
                "purchase_uom": str(self.uoms["KG"].id),
                "stock_uom": str(self.uoms["KG"].id),
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        item_id = create.data["id"] if "id" in create.data else create.data["data"]["id"]

        listed = self.client.get(reverse("item-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)

        detail = self.client.get(reverse("item-detail", args=[item_id]))
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

        updated = self.client.patch(
            reverse("item-detail", args=[item_id]),
            {"name": "PLA Raw Material Updated"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(reverse("item-detail", args=[item_id]))
        self.assertIn(deleted.status_code, (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK))
        self.assertFalse(Item.objects.get(pk=item_id).is_active)

    def test_frontend_compatibility_domainrecord_products_still_works(self):
        response = self.client.get(reverse("products-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("data", response.data)

    def test_landed_cost_preview_api(self):
        fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CN-A",
            legal_name="China Supplier A Co. Ltd.",
            trading_name="China Supplier A",
            preferred_incoterm=fob,
        )
        item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uoms["KG"],
            purchase_uom=self.uoms["KG"],
            stock_uom=self.uoms["KG"],
            preferred_supplier=supplier,
        )
        lot_resp = self.client.post(
            reverse("inventory-lot-list"),
            {
                "company": str(self.company.id),
                "lot_number": "LOT-ACC-001",
                "item": str(item.id),
                "supplier": str(supplier.id),
                "uom": str(self.uoms["KG"].id),
                "initial_quantity": "100",
                "remaining_quantity": "100",
                "purchase_unit_cost": "1000",
                "currency": str(self.npr.id),
            },
            format="json",
        )
        self.assertEqual(lot_resp.status_code, status.HTTP_201_CREATED)
        lot_id = lot_resp.data.get("id") or lot_resp.data["data"]["id"]

        doc_resp = self.client.post(
            reverse("landed-cost-document-list"),
            {
                "company": str(self.company.id),
                "document_number": "LC-ACC-001",
                "lot": lot_id,
                "currency": str(self.npr.id),
                "purchase_quantity": "100",
                "purchase_unit_cost": "1000",
                "reference": "FOB Shanghai",
            },
            format="json",
        )
        self.assertEqual(doc_resp.status_code, status.HTTP_201_CREATED)
        doc_id = doc_resp.data.get("id") or doc_resp.data["data"]["id"]

        for cat, amt in [
            ("INTERNATIONAL_FREIGHT", "10000"),
            ("INSURANCE", "2000"),
            ("CUSTOMS_DUTY", "8000"),
            ("CLEARING", "3000"),
            ("NEPAL_TRANSPORT", "5000"),
        ]:
            c = self.client.post(
                reverse("landed-cost-component-list"),
                {
                    "document": doc_id,
                    "category": cat,
                    "amount": amt,
                    "currency": str(self.npr.id),
                    "exchange_rate": "1",
                    "allocation_basis": "VALUE",
                },
                format="json",
            )
            self.assertEqual(c.status_code, status.HTTP_201_CREATED, c.data)

        preview = self.client.post(reverse("landed-cost-document-preview", args=[doc_id]), {}, format="json")
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        data = preview.data.get("data", preview.data)
        self.assertEqual(data["purchase_value"], "100000.0000")
        self.assertEqual(data["landed_total"], "128000.0000")
        self.assertEqual(data["landed_unit_cost"], "1280.000000")


class PermissionIsolationTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap", legal_name="EcoWrap Pvt")
        Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.module = Module.objects.create(code="inventory", name="Inventory")
        self.role = Role.objects.create(code="inv_viewer", name="Inv Viewer")
        self.user = User.objects.create_user(email="viewer@ecowrap.com", password="Str0ng!Passw0rd")
        UserRole.objects.create(user=self.user, role=self.role)
        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_unauthorized_list(self):
        response = self.client.get(reverse("item-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_update(self):
        RolePermission.objects.create(
            role=self.role, module=self.module, action=Action.VIEW, is_allowed=True
        )
        # create item as superuser path not available — insert directly
        kg, _ = UnitOfMeasure.objects.get_or_create(code="KG", defaults={"name": "Kilogram"})
        item = Item.objects.create(
            company=self.company,
            sku="X1",
            name="X",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=kg,
            purchase_uom=kg,
            stock_uom=kg,
        )
        response = self.client.patch(
            reverse("item-detail", args=[item.id]), {"name": "Hacked"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
