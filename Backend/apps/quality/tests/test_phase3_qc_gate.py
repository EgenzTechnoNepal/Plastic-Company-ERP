"""Phase 3 — QC plant gate: auto bin, auto inspection, CoA, Fail→NCR."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.exceptions import InvalidStatusTransitionError
from apps.inventory.models import Item, ItemType, LotStatus, UnitOfMeasure
from apps.inventory.services import transition_lot_status
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.quality.models import Record as QualityRecord
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.quality.qc_services import QCError, fail_inspection, pass_inspection, start_reinspect
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase3QcGateTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap QC3", legal_name="EcoWrap QC3 Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-QC3",
            legal_name="Supplier QC3",
            trading_name="Supplier QC3",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-QC3-001",
            name="PLA QC3",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            coa_required=True,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-QC3", name="Main QC3")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-QC3", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="qc3@ecowrap.com", password="Str0ng!Passw0rd")

    def _post_qc_grn(self, suffix="1"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-QC3-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-QC3-{suffix}",
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
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-QC3-{suffix}",
        )
        return post_grn(grn=grn, user=self.user)

    def test_grn_places_qc_hold_bin_and_creates_inspection(self):
        grn = self._post_qc_grn("A")
        line = GoodsReceiptLine.objects.select_related("lot", "lot__bin").get(grn=grn)
        lot = line.lot
        self.assertIsNotNone(lot)
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        self.assertEqual(lot.bin.bin_type, BinType.QC_HOLD)
        insp = QCInspection.objects.get(lot=lot)
        self.assertEqual(insp.status, QCInspectionStatus.DRAFT)
        self.assertEqual(insp.grn_id, grn.id)

    def test_pass_blocked_without_coa_then_allowed(self):
        grn = self._post_qc_grn("B")
        insp = QCInspection.objects.get(grn=grn)
        with self.assertRaises(QCError) as ctx:
            pass_inspection(inspection=insp, user=self.user)
        self.assertEqual(ctx.exception.code, "COA_REQUIRED")

        insp.coa_reference = "COA-2026-001"
        insp.save(update_fields=["coa_reference", "updated_at"])
        passed = pass_inspection(inspection=insp, user=self.user)
        self.assertEqual(passed.status, QCInspectionStatus.PASSED)
        lot = passed.lot
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)
        self.assertEqual(lot.certificate_coa_reference, "COA-2026-001")

    def test_fail_moves_quarantine_and_creates_ncr(self):
        grn = self._post_qc_grn("C")
        insp = QCInspection.objects.get(grn=grn)
        failed = fail_inspection(inspection=insp, user=self.user)
        self.assertEqual(failed.status, QCInspectionStatus.FAILED)
        self.assertTrue(failed.ncr_reference)
        lot = failed.lot
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.QUARANTINED)
        self.assertEqual(lot.bin.bin_type, BinType.QUARANTINE)
        self.assertTrue(QualityRecord.objects.filter(entity="ncrs", code=failed.ncr_reference).exists())

    def test_cannot_free_transition_quarantined_to_available(self):
        grn = self._post_qc_grn("D")
        insp = QCInspection.objects.get(grn=grn)
        fail_inspection(inspection=insp, user=self.user)
        lot = insp.lot
        lot.refresh_from_db()
        with self.assertRaises(InvalidStatusTransitionError):
            transition_lot_status(lot, LotStatus.AVAILABLE, user=self.user)

        re = start_reinspect(lot=lot, user=self.user)
        self.assertEqual(re.status, QCInspectionStatus.DRAFT)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        re.coa_reference = "COA-RE-1"
        re.save(update_fields=["coa_reference", "updated_at"])
        pass_inspection(inspection=re, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)
