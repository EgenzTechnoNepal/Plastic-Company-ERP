"""Wave 2 — Fail disposition RETURN / SCRAP tests."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.ledger import StockLedgerEntry, StockTxnType
from apps.inventory.models import Item, ItemType, LotStatus, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Record as ProcRecord, Supplier
from apps.quality.disposition_services import DispositionError, dispose_failed_material
from apps.quality.models import Record as QualityRecord
from apps.quality.qc import QCInspection
from apps.quality.qc_services import fail_inspection
from apps.warehouse.models import Bin, BinType, Warehouse


class Wave2DispositionTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap W2", legal_name="EcoWrap W2 Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-W2",
            legal_name="Supplier W2",
            trading_name="Supplier W2",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-W2-001",
            name="PLA W2",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            coa_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-W2", name="Main W2")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-W2", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="w2@ecowrap.com", password="Str0ng!Passw0rd")

    def _failed_inspection(self, suffix="1"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-W2-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-W2-{suffix}",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal("10"),
            accepted_quantity=Decimal("10"),
            purchase_unit_cost=Decimal("12"),
            lot_number=f"LOT-W2-{suffix}",
        )
        post_grn(grn=grn, user=self.user)
        insp = QCInspection.objects.get(grn=grn)
        return fail_inspection(inspection=insp, user=self.user)

    def test_scrap_writes_off_and_rejects(self):
        insp = self._failed_inspection("S")
        result = dispose_failed_material(action="SCRAP", inspection=insp, user=self.user)
        self.assertEqual(result["action"], "SCRAP")
        lot = insp.lot
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.REJECTED)
        self.assertEqual(Decimal(str(lot.remaining_quantity)), Decimal("0"))
        self.assertTrue(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ADJUSTMENT_OUT, lot=lot).exists()
        )
        ncr = QualityRecord.objects.get(entity="ncrs", code=insp.ncr_reference)
        self.assertEqual(ncr.status, "closed")
        self.assertEqual(ncr.fields.get("disposition"), "SCRAP")

    def test_return_creates_prt_and_dbn(self):
        insp = self._failed_inspection("R")
        result = dispose_failed_material(action="RETURN", inspection=insp, user=self.user)
        self.assertTrue(result.get("purchase_return"))
        self.assertTrue(result.get("debit_note"))
        self.assertTrue(ProcRecord.objects.filter(entity="purchase_returns", code=result["purchase_return"]).exists())
        self.assertTrue(ProcRecord.objects.filter(entity="debit_notes", code=result["debit_note"]).exists())
        with self.assertRaises(DispositionError):
            dispose_failed_material(action="SCRAP", inspection=insp, user=self.user)
