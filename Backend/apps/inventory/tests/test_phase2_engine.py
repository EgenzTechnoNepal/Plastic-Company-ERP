"""
Phase 2 E2E acceptance + core inbound/QC/FIFO/landed/ledger tests.
"""

from datetime import timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor

from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.exceptions import InsufficientStockError, InvalidStatusTransitionError
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.models import (
    Item,
    ItemType,
    InventoryLot,
    InventoryReceiptLayer,
    LandedCostCategory,
    LandedCostDocument,
    LotStatus,
    UnitOfMeasure,
)
from apps.inventory.ledger import StockLedgerEntry, StockTxnType
from apps.inventory.services import create_landed_component, preview_landed_cost
from apps.inventory.stock_services import compute_balances, fifo_issue
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote, GrnStatus
from apps.procurement.inbound_services import cancel_gate_entry, post_grn, submit_gate_entry
from apps.procurement.models import Incoterm, Supplier
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.quality.qc_services import fail_inspection, pass_inspection
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase2Base(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap Nepal", legal_name="EcoWrap Nepal Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(code="KG", defaults={"name": "Kilogram", "is_base_weight": True})
        self.fob, _ = Incoterm.objects.get_or_create(code="FOB", defaults={"name": "Free On Board", "version": "2020"})
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CN-A",
            legal_name="China Supplier A Co. Ltd.",
            trading_name="China Supplier A",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
            preferred_supplier=self.supplier,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-MAIN", name="Main")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-01", bin_type=BinType.RECEIVING
        )
        self.bin_rm = Bin.objects.create(
            warehouse=self.warehouse, code="RM-01", bin_type=BinType.RAW_MATERIAL
        )
        self.user = User.objects.create_superuser(email="p2@ecowrap.com", password="Str0ng!Passw0rd")


class GateEntryTests(Phase2Base):
    def test_gate_submit_cancel_no_stock(self):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-001",
            entry_at=timezone.now(),
            supplier=self.supplier,
            vehicle_number="NP-01",
            driver_name="Ram",
        )
        submit_gate_entry(gate=gate, user=self.user)
        gate.refresh_from_db()
        self.assertEqual(gate.status, GateEntryStatus.SUBMITTED)
        self.assertEqual(StockLedgerEntry.objects.count(), 0)
        self.assertEqual(InventoryLot.objects.count(), 0)

        gate2 = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-002",
            entry_at=timezone.now(),
            supplier=self.supplier,
        )
        cancel_gate_entry(gate=gate2, user=self.user)
        gate2.refresh_from_db()
        self.assertEqual(gate2.status, GateEntryStatus.CANCELLED)
        self.assertEqual(StockLedgerEntry.objects.count(), 0)


class GrnQcLandedFifoE2ETests(Phase2Base):
    def _create_posted_grn(self, qty, unit_cost, lot_suffix="A"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-{lot_suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-{lot_suffix}",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
            purchase_reference="PO-FOB-SHANGHAI",
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal(str(qty)),
            accepted_quantity=Decimal(str(qty)),
            purchase_unit_cost=Decimal(str(unit_cost)),
            lot_number=f"LOT-{lot_suffix}",
            supplier_lot_number=f"SUP-{lot_suffix}",
        )
        return post_grn(grn=grn, user=self.user)

    def test_acceptance_e2e_landed_and_fifo(self):
        grn = self._create_posted_grn(100, 1000, "A")
        self.assertEqual(grn.status, GrnStatus.POSTED)
        lot = InventoryLot.objects.get(lot_number="LOT-A")
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000"))
        self.assertIsNone(lot.landed_unit_cost)
        self.assertEqual(StockLedgerEntry.objects.filter(txn_type=StockTxnType.GRN_RECEIPT).count(), 1)

        # Duplicate post blocked
        with self.assertRaises(Exception):
            post_grn(grn=grn, user=self.user)

        # Cannot FIFO issue while QC_HOLD
        with self.assertRaises(InsufficientStockError):
            fifo_issue(
                company=self.company,
                item=self.item,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )

        balances = compute_balances(company=self.company, item=self.item)
        self.assertEqual(balances["qc_hold"], "100.000000")
        self.assertEqual(balances["available_to_consume"], "0.000000")

        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number="QC-001",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=inspection, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

        # Landed cost components
        doc = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LC-001",
            lot=lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )
        for cat, amt in [
            (LandedCostCategory.INTERNATIONAL_FREIGHT, "10000"),
            (LandedCostCategory.INSURANCE, "2000"),
            (LandedCostCategory.CUSTOMS_DUTY, "8000"),
            (LandedCostCategory.CLEARING, "3000"),
            (LandedCostCategory.NEPAL_TRANSPORT, "5000"),
        ]:
            create_landed_component(
                doc, category=cat, amount=Decimal(amt), currency=self.npr, exchange_rate=Decimal("1")
            )
        preview = preview_landed_cost(doc)
        self.assertEqual(preview["purchase_value"], "100000.0000")
        self.assertEqual(preview["landed_total"], "128000.0000")
        self.assertEqual(preview["landed_unit_cost"], "1280.000000")

        posted = post_landed_cost(document=doc, user=self.user)
        self.assertEqual(posted["landed_unit_cost"], "1280.000000")
        lot.refresh_from_db()
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000"))
        self.assertEqual(lot.landed_unit_cost, Decimal("1280.000000"))
        layer_a = InventoryReceiptLayer.objects.get(lot=lot)
        self.assertEqual(layer_a.landed_unit_cost, Decimal("1280.000000"))
        self.assertEqual(layer_a.purchase_unit_cost, Decimal("1000"))

        # Second lot 200 @ 1350 (skip QC for speed: set qc_required False temporarily)
        self.item.qc_required = False
        self.item.save(update_fields=["qc_required"])
        grn_b = self._create_posted_grn(200, 1350, "B")
        lot_b = InventoryLot.objects.get(lot_number="LOT-B")
        self.assertEqual(lot_b.status, LotStatus.AVAILABLE)
        layer_b = InventoryReceiptLayer.objects.get(lot=lot_b)
        layer_b.landed_unit_cost = Decimal("1350")
        layer_b.save(update_fields=["landed_unit_cost"])
        lot_b.landed_unit_cost = Decimal("1350")
        lot_b.save(update_fields=["landed_unit_cost"])

        entries = fifo_issue(
            company=self.company,
            item=self.item,
            quantity=Decimal("150"),
            uom=self.kg,
            user=self.user,
        )
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0].quantity_out, Decimal("100.000000"))
        self.assertEqual(entries[0].unit_cost, Decimal("1280.000000"))
        self.assertEqual(entries[1].quantity_out, Decimal("50.000000"))
        self.assertEqual(entries[1].unit_cost, Decimal("1350.000000"))

        layer_a.refresh_from_db()
        layer_b.refresh_from_db()
        self.assertEqual(layer_a.remaining_quantity, Decimal("0.000000"))
        self.assertEqual(layer_b.remaining_quantity, Decimal("150.000000"))

    def test_qc_fail_blocks_fifo(self):
        grn = self._create_posted_grn(50, 1000, "F")
        lot = InventoryLot.objects.get(lot_number="LOT-F")
        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number="QC-F",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        fail_inspection(inspection=inspection, disposition="REJECTED", user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.REJECTED)
        with self.assertRaises(InsufficientStockError):
            fifo_issue(
                company=self.company, item=self.item, quantity=Decimal("1"), uom=self.kg, user=self.user
            )

    def test_ledger_immutable(self):
        self._create_posted_grn(10, 1000, "IMM")
        entry = StockLedgerEntry.objects.first()
        with self.assertRaises(ValueError):
            entry.reason = "hack"
            entry.save()
        with self.assertRaises(ValueError):
            entry.delete()


class Phase2ApiSmokeTests(APITestCase):
    def setUp(self):
        self.base = Phase2Base()
        self.base.setUp()
        for attr in (
            "company",
            "npr",
            "kg",
            "supplier",
            "item",
            "warehouse",
            "bin_recv",
            "user",
        ):
            setattr(self, attr, getattr(self.base, attr))
        login = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    def test_gate_api_no_stock(self):
        resp = self.client.post(
            reverse("inbound-gate-list"),
            {
                "company": str(self.company.id),
                "gate_entry_number": "GE-API-1",
                "entry_at": timezone.now().isoformat(),
                "supplier": str(self.supplier.id),
                "vehicle_number": "NP-99",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        gate_id = resp.data["id"]
        submit = self.client.post(reverse("inbound-gate-submit", args=[gate_id]), {}, format="json")
        self.assertEqual(submit.status_code, status.HTTP_200_OK)
        self.assertEqual(StockLedgerEntry.objects.count(), 0)
