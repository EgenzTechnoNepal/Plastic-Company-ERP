"""
Phase 2 hardening — inventory integrity regression tests.

Covers multi-layer reservations, partial putaway/transfer, explicit-layer
adjustment, ledger reconciliation, landed-cost late adjustments, company
isolation at the service layer, and deterministic locking behavior.
"""

from decimal import Decimal

from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.exceptions import InsufficientStockError
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.ledger import (
    ReservationStatus,
    StockLedgerEntry,
    StockTxnType,
)
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
from apps.inventory.services import create_landed_component
from apps.inventory.stock_services import (
    ReservationError,
    compute_balances,
    fifo_issue,
    reconcile_item,
    release_reservation,
    reserve_stock,
)
from apps.organization.company_scope import CompanyAccessDenied
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.warehouse.models import Bin, BinType, Warehouse
from apps.warehouse.operations import PutawayOrder, StockAdjustment, StockTransfer
from apps.warehouse.ops_services import WarehouseOpsError, post_adjustment, post_putaway, post_transfer


class HardeningBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="HardCo", legal_name="HardCo Pvt")
        self.other = Company.objects.create(name="OtherCo", legal_name="OtherCo Pvt")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(code="FOB", defaults={"name": "FOB", "version": "2020"})
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-H",
            legal_name="Supplier H",
            trading_name="Supplier H",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-H-001",
            name="Hardening RM",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
            preferred_supplier=self.supplier,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-H", name="Main H")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-H", bin_type=BinType.RECEIVING
        )
        self.bin_rm = Bin.objects.create(
            warehouse=self.warehouse, code="RM-H", bin_type=BinType.RAW_MATERIAL
        )
        self.bin_rm2 = Bin.objects.create(
            warehouse=self.warehouse, code="RM-H2", bin_type=BinType.RAW_MATERIAL
        )
        self.other_wh = Warehouse.objects.create(company=self.other, code="WH-O", name="Other WH")
        self.other_bin = Bin.objects.create(
            warehouse=self.other_wh, code="BIN-O", bin_type=BinType.RAW_MATERIAL
        )
        self.user = User.objects.create_superuser(email="hard@ecowrap.com", password="Str0ng!Passw0rd")

    def _grn(self, qty, unit_cost, suffix):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-H-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-H-{suffix}",
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
            received_quantity=Decimal(str(qty)),
            accepted_quantity=Decimal(str(qty)),
            purchase_unit_cost=Decimal(str(unit_cost)),
            lot_number=f"LOT-H-{suffix}",
        )
        return post_grn(grn=grn, user=self.user)

    def _available_lot(self, qty, unit_cost, suffix):
        self._grn(qty, unit_cost, suffix)
        lot = InventoryLot.objects.get(lot_number=f"LOT-H-{suffix}")
        if lot.status == LotStatus.QC_HOLD:
            lot.status = LotStatus.AVAILABLE
            lot.save(update_fields=["status"])
        return lot


class ReservationHardeningTests(HardeningBase):
    def test_reserve_one_layer(self):
        lot = self._available_lot(100, 1000, "R1")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        res = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("40"),
            uom=self.kg,
            user=self.user,
            receipt_layer=layer,
        )
        layer.refresh_from_db()
        self.assertEqual(layer.reserved_quantity, Decimal("40.000000"))
        self.assertEqual(res.allocations.count(), 1)
        self.assertEqual(res.allocations.first().quantity, Decimal("40.000000"))

    def test_reserve_multiple_layers_and_release(self):
        lot_a = self._available_lot(100, 1000, "RA")
        lot_b = self._available_lot(100, 1100, "RB")
        layer_a = InventoryReceiptLayer.objects.get(lot=lot_a)
        layer_b = InventoryReceiptLayer.objects.get(lot=lot_b)
        atc_before = Decimal(compute_balances(company=self.company, item=self.item)["available_to_consume"])

        res = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("150"),
            uom=self.kg,
            user=self.user,
        )
        layer_a.refresh_from_db()
        layer_b.refresh_from_db()
        self.assertEqual(layer_a.reserved_quantity, Decimal("100.000000"))
        self.assertEqual(layer_b.reserved_quantity, Decimal("50.000000"))
        self.assertEqual(res.allocations.count(), 2)
        allocs = {a.receipt_layer_id: a.quantity for a in res.allocations.all()}
        self.assertEqual(allocs[layer_a.id], Decimal("100.000000"))
        self.assertEqual(allocs[layer_b.id], Decimal("50.000000"))

        release_reservation(reservation=res, user=self.user)
        layer_a.refresh_from_db()
        layer_b.refresh_from_db()
        self.assertEqual(layer_a.reserved_quantity, Decimal("0.000000"))
        self.assertEqual(layer_b.reserved_quantity, Decimal("0.000000"))
        res.refresh_from_db()
        self.assertEqual(res.status, ReservationStatus.RELEASED)
        atc_after = Decimal(compute_balances(company=self.company, item=self.item)["available_to_consume"])
        self.assertEqual(atc_after, atc_before)

    def test_reservation_cannot_exceed_atc(self):
        self._available_lot(50, 1000, "RX")
        with self.assertRaises(Exception):
            reserve_stock(
                company=self.company,
                item=self.item,
                quantity=Decimal("51"),
                uom=self.kg,
                user=self.user,
            )

    def test_release_one_layer_reservation(self):
        lot = self._available_lot(80, 1000, "R1L")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        res = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("25"),
            uom=self.kg,
            user=self.user,
            receipt_layer=layer,
        )
        release_reservation(reservation=res, user=self.user)
        layer.refresh_from_db()
        self.assertEqual(layer.reserved_quantity, Decimal("0.000000"))


class PutawayHardeningTests(HardeningBase):
    def test_full_putaway(self):
        lot = self._available_lot(100, 1000, "PF")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        self.assertEqual(layer.bin_id, self.bin_recv.id)
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-FULL",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("100"),
        )
        post_putaway(putaway=putaway, user=self.user)
        layer.refresh_from_db()
        self.assertEqual(layer.bin_id, self.bin_rm.id)
        outs = StockLedgerEntry.objects.filter(txn_type=StockTxnType.PUTAWAY_OUT, reference_id=putaway.id)
        inns = StockLedgerEntry.objects.filter(txn_type=StockTxnType.PUTAWAY_IN, reference_id=putaway.id)
        self.assertEqual(outs.count(), 1)
        self.assertEqual(sum(o.quantity_out for o in outs), Decimal("100.000000"))
        self.assertEqual(sum(i.quantity_in for i in inns), Decimal("100.000000"))

    def test_partial_putaway(self):
        lot = self._available_lot(100, 1000, "PP")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-PART",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("30"),
        )
        post_putaway(putaway=putaway, user=self.user)
        src = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_recv)
        dst = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_rm)
        self.assertEqual(src.remaining_quantity, Decimal("70.000000"))
        self.assertEqual(dst.remaining_quantity, Decimal("30.000000"))
        self.assertEqual(src.purchase_unit_cost, dst.purchase_unit_cost)
        self.assertEqual(src.fifo_rank, dst.fifo_rank)
        lot.refresh_from_db()
        self.assertEqual(lot.remaining_quantity, Decimal("100.000000"))

    def test_putaway_insufficient(self):
        lot = self._available_lot(20, 1000, "PI")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-INS",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("50"),
        )
        with self.assertRaises(WarehouseOpsError):
            post_putaway(putaway=putaway, user=self.user)

    def test_putaway_qc_hold_rejected(self):
        self.item.qc_required = True
        self.item.save(update_fields=["qc_required"])
        self._grn(40, 1000, "PQ")
        lot = InventoryLot.objects.get(lot_number="LOT-H-PQ")
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-QC",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("40"),
        )
        with self.assertRaises(WarehouseOpsError):
            post_putaway(putaway=putaway, user=self.user)

    def test_putaway_cross_company_rejected(self):
        lot = self._available_lot(10, 1000, "PX")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-XC",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.other_wh,
            to_bin=self.other_bin,
            quantity=Decimal("10"),
        )
        with self.assertRaises(CompanyAccessDenied):
            post_putaway(putaway=putaway, user=self.user)


class TransferHardeningTests(HardeningBase):
    def _ready_at_rm(self, qty, suffix):
        lot = self._available_lot(qty, 1000, suffix)
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number=f"PA-{suffix}",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal(str(qty)),
        )
        post_putaway(putaway=putaway, user=self.user)
        lot.refresh_from_db()
        return lot

    def test_full_transfer(self):
        lot = self._ready_at_rm(50, "TF")
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-FULL",
            item=self.item,
            lot=lot,
            quantity=Decimal("50"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_rm,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm2,
        )
        post_transfer(transfer=xfer, user=self.user)
        layer = InventoryReceiptLayer.objects.get(lot=lot, remaining_quantity__gt=0)
        self.assertEqual(layer.bin_id, self.bin_rm2.id)
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.TRANSFER_OUT, reference_id=xfer.id).count(),
            1,
        )
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.TRANSFER_IN, reference_id=xfer.id).count(),
            1,
        )

    def test_partial_transfer(self):
        lot = self._ready_at_rm(100, "TP")
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-PART",
            item=self.item,
            lot=lot,
            quantity=Decimal("20"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_rm,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm2,
        )
        post_transfer(transfer=xfer, user=self.user)
        src = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_rm)
        dst = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_rm2)
        self.assertEqual(src.remaining_quantity, Decimal("80.000000"))
        self.assertEqual(dst.remaining_quantity, Decimal("20.000000"))
        outs = StockLedgerEntry.objects.filter(txn_type=StockTxnType.TRANSFER_OUT, reference_id=xfer.id)
        inns = StockLedgerEntry.objects.filter(txn_type=StockTxnType.TRANSFER_IN, reference_id=xfer.id)
        self.assertEqual(sum(o.quantity_out for o in outs), Decimal("20.000000"))
        self.assertEqual(sum(i.quantity_in for i in inns), Decimal("20.000000"))

    def test_transfer_insufficient(self):
        lot = self._ready_at_rm(10, "TI")
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-INS",
            item=self.item,
            lot=lot,
            quantity=Decimal("99"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_rm,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm2,
        )
        with self.assertRaises(WarehouseOpsError):
            post_transfer(transfer=xfer, user=self.user)

    def test_transfer_qc_hold_rejected(self):
        self.item.qc_required = True
        self.item.save(update_fields=["qc_required"])
        self._grn(15, 1000, "TQ")
        lot = InventoryLot.objects.get(lot_number="LOT-H-TQ")
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-QC",
            item=self.item,
            lot=lot,
            quantity=Decimal("5"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
        )
        with self.assertRaises(WarehouseOpsError):
            post_transfer(transfer=xfer, user=self.user)

    def test_transfer_quarantined_rejected(self):
        lot = self._available_lot(15, 1000, "TQZ")
        lot.status = LotStatus.QUARANTINED
        lot.save(update_fields=["status"])
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-QZ",
            item=self.item,
            lot=lot,
            quantity=Decimal("5"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
        )
        with self.assertRaises(WarehouseOpsError):
            post_transfer(transfer=xfer, user=self.user)

    def test_transfer_rejected_status_rejected(self):
        lot = self._available_lot(15, 1000, "TRJ")
        lot.status = LotStatus.REJECTED
        lot.save(update_fields=["status"])
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-RJ",
            item=self.item,
            lot=lot,
            quantity=Decimal("5"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
        )
        with self.assertRaises(WarehouseOpsError):
            post_transfer(transfer=xfer, user=self.user)

    def test_transfer_cross_company_rejected(self):
        lot = self._ready_at_rm(10, "TX")
        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-XC",
            item=self.item,
            lot=lot,
            quantity=Decimal("5"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_rm,
            to_warehouse=self.other_wh,
            to_bin=self.other_bin,
        )
        with self.assertRaises(CompanyAccessDenied):
            post_transfer(transfer=xfer, user=self.user)


class AdjustmentHardeningTests(HardeningBase):
    def test_one_layer_explicit(self):
        lot = self._available_lot(100, 1000, "A1")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        adj = StockAdjustment.objects.create(
            company=self.company,
            adjustment_number="ADJ-1",
            item=self.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=self.warehouse,
            bin=self.bin_recv,
            quantity_delta=Decimal("-10"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="shrink",
        )
        post_adjustment(adjustment=adj, user=self.user)
        layer.refresh_from_db()
        self.assertEqual(layer.remaining_quantity, Decimal("90.000000"))

    def test_multi_layer_requires_explicit_layer(self):
        lot = self._available_lot(100, 1000, "AM")
        # Force a second layer on same lot via partial putaway then adjust without layer
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-AM",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("40"),
        )
        post_putaway(putaway=putaway, user=self.user)
        self.assertEqual(InventoryReceiptLayer.objects.filter(lot=lot).count(), 2)
        adj = StockAdjustment.objects.create(
            company=self.company,
            adjustment_number="ADJ-NO-LAYER",
            item=self.item,
            lot=lot,
            receipt_layer=None,
            warehouse=self.warehouse,
            bin=self.bin_recv,
            quantity_delta=Decimal("-5"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="bad",
        )
        with self.assertRaises(WarehouseOpsError) as ctx:
            post_adjustment(adjustment=adj, user=self.user)
        self.assertEqual(ctx.exception.code, "LAYER_REQUIRED")

    def test_multi_layer_explicit_targets_correct_layer(self):
        lot = self._available_lot(100, 1000, "AX")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-AX",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("40"),
        )
        post_putaway(putaway=putaway, user=self.user)
        src = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_recv)
        dst = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_rm)
        adj = StockAdjustment.objects.create(
            company=self.company,
            adjustment_number="ADJ-DST",
            item=self.item,
            lot=lot,
            receipt_layer=dst,
            warehouse=self.warehouse,
            bin=self.bin_rm,
            quantity_delta=Decimal("-5"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="count",
        )
        post_adjustment(adjustment=adj, user=self.user)
        src.refresh_from_db()
        dst.refresh_from_db()
        self.assertEqual(src.remaining_quantity, Decimal("60.000000"))
        self.assertEqual(dst.remaining_quantity, Decimal("35.000000"))

    def test_negative_prevention(self):
        lot = self._available_lot(10, 1000, "AN")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        adj = StockAdjustment.objects.create(
            company=self.company,
            adjustment_number="ADJ-NEG",
            item=self.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=self.warehouse,
            bin=self.bin_recv,
            quantity_delta=Decimal("-50"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="too much",
        )
        with self.assertRaises(WarehouseOpsError):
            post_adjustment(adjustment=adj, user=self.user)


class ReconciliationHardeningTests(HardeningBase):
    def test_grn_putaway_transfer_fifo_adjustment_reservation(self):
        lot = self._available_lot(100, 1000, "RC")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-RC",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=Decimal("30"),
        )
        post_putaway(putaway=putaway, user=self.user)

        xfer = StockTransfer.objects.create(
            company=self.company,
            transfer_number="TR-RC",
            item=self.item,
            lot=lot,
            quantity=Decimal("10"),
            uom=self.kg,
            from_warehouse=self.warehouse,
            from_bin=self.bin_rm,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm2,
        )
        post_transfer(transfer=xfer, user=self.user)

        # Putaway remainder into RM so FIFO can consume from available storage layers
        rem_src = InventoryReceiptLayer.objects.get(lot=lot, bin=self.bin_recv)
        putaway2 = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-RC2",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=self.bin_rm,
            quantity=rem_src.remaining_quantity,
        )
        post_putaway(putaway=putaway2, user=self.user)

        layer_rm = InventoryReceiptLayer.objects.filter(lot=lot, bin=self.bin_rm).order_by("id").first()
        adj = StockAdjustment.objects.create(
            company=self.company,
            adjustment_number="ADJ-RC",
            item=self.item,
            lot=lot,
            receipt_layer=layer_rm,
            warehouse=self.warehouse,
            bin=self.bin_rm,
            quantity_delta=Decimal("-5"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="adj",
        )
        post_adjustment(adjustment=adj, user=self.user)

        res = reserve_stock(
            company=self.company, item=self.item, quantity=Decimal("10"), uom=self.kg, user=self.user
        )
        self.assertEqual(res.allocations.count(), 1)

        fifo_issue(
            company=self.company, item=self.item, quantity=Decimal("15"), uom=self.kg, user=self.user
        )

        report = reconcile_item(company=self.company, item=self.item)
        self.assertTrue(report["all_balanced"], report)
        balances = report["balances"]
        # Physical != availability: reserved reduces ATC only
        physical = Decimal(balances["physical"])
        reserved = Decimal(balances["reserved"])
        atc = Decimal(balances["available_to_consume"])
        self.assertEqual(atc, Decimal(balances["available"]) - reserved)
        self.assertGreater(physical, 0)

        # QC state event must not change physical
        qc_entries = StockLedgerEntry.objects.filter(
            txn_type__in=[StockTxnType.QC_RELEASE, StockTxnType.QC_REJECT]
        )
        for e in qc_entries:
            self.assertTrue(e.is_state_event)
            self.assertEqual(e.quantity_in, 0)
            self.assertEqual(e.quantity_out, 0)


class LandedCostHardeningTests(HardeningBase):
    def test_initial_and_late_repeated_adjustment(self):
        lot = self._available_lot(100, 1000, "LC")
        doc1 = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LC-H1",
            lot=lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )
        create_landed_component(
            doc1,
            category=LandedCostCategory.INTERNATIONAL_FREIGHT,
            amount=Decimal("10000"),
            currency=self.npr,
            exchange_rate=Decimal("1"),
        )
        r1 = post_landed_cost(document=doc1, user=self.user)
        self.assertEqual(r1["landed_unit_cost"], "1100.000000")
        lot.refresh_from_db()
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000.000000"))
        self.assertEqual(lot.landed_unit_cost, Decimal("1100.000000"))

        doc2 = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LC-H2",
            lot=lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )
        create_landed_component(
            doc2,
            category=LandedCostCategory.CUSTOMS_DUTY,
            amount=Decimal("5000"),
            currency=self.npr,
            exchange_rate=Decimal("1"),
        )
        r2 = post_landed_cost(document=doc2, user=self.user)
        self.assertEqual(r2["landed_unit_cost"], "1150.000000")
        lot.refresh_from_db()
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000.000000"))
        self.assertEqual(lot.landed_unit_cost, Decimal("1150.000000"))
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        self.assertEqual(layer.purchase_unit_cost, Decimal("1000.000000"))
        self.assertEqual(layer.landed_unit_cost, Decimal("1150.000000"))

        # Third adjustment — cumulative again
        doc3 = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LC-H3",
            lot=lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )
        create_landed_component(
            doc3,
            category=LandedCostCategory.CLEARING,
            amount=Decimal("2500"),
            currency=self.npr,
            exchange_rate=Decimal("1"),
        )
        r3 = post_landed_cost(document=doc3, user=self.user)
        self.assertEqual(r3["landed_unit_cost"], "1175.000000")
        lot.refresh_from_db()
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000.000000"))


class CompanyIsolationServiceTests(HardeningBase):
    def test_reserve_cross_company_item_fails(self):
        other_item = Item.objects.create(
            company=self.other,
            sku="OTHER-1",
            name="Other",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self._available_lot(10, 1000, "ISO")
        with self.assertRaises(CompanyAccessDenied):
            reserve_stock(
                company=self.company,
                item=other_item,
                quantity=Decimal("1"),
                uom=self.kg,
                user=self.user,
            )

    def test_fifo_cross_company_warehouse_fails(self):
        self._available_lot(10, 1000, "ISF")
        with self.assertRaises(CompanyAccessDenied):
            fifo_issue(
                company=self.company,
                item=self.item,
                quantity=Decimal("1"),
                uom=self.kg,
                user=self.user,
                warehouse=self.other_wh,
            )

    def test_adjustment_cross_company_layer_fails(self):
        lot = self._available_lot(10, 1000, "ISA")
        layer = InventoryReceiptLayer.objects.get(lot=lot)
        # Corrupt layer company pointer attempt via foreign company adjustment
        adj = StockAdjustment.objects.create(
            company=self.other,
            adjustment_number="ADJ-ISO",
            item=self.item,
            lot=lot,
            receipt_layer=layer,
            warehouse=self.warehouse,
            bin=self.bin_recv,
            quantity_delta=Decimal("-1"),
            uom=self.kg,
            unit_cost=Decimal("1000"),
            reason="x",
        )
        with self.assertRaises((CompanyAccessDenied, WarehouseOpsError)):
            post_adjustment(adjustment=adj, user=self.user)


class QcStateEventTests(HardeningBase):
    def test_qc_pass_is_state_event_no_qty(self):
        self.item.qc_required = True
        self.item.save(update_fields=["qc_required"])
        grn = self._grn(25, 1000, "QC")
        lot = InventoryLot.objects.get(lot_number="LOT-H-QC")
        rem_before = lot.remaining_quantity
        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number="QC-H1",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=inspection, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.remaining_quantity, rem_before)
        entry = StockLedgerEntry.objects.get(txn_type=StockTxnType.QC_RELEASE, reference_id=inspection.id)
        self.assertTrue(entry.is_state_event)
        self.assertEqual(entry.quantity_in, 0)
        self.assertEqual(entry.quantity_out, 0)


class ConcurrencyLockingTests(TransactionTestCase):
    def setUp(self):
        self.company = Company.objects.create(name="ConcCo", legal_name="ConcCo Pvt")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(code="FOB", defaults={"name": "FOB", "version": "2020"})
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-C",
            legal_name="S",
            trading_name="S",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-C",
            name="C",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
            preferred_supplier=self.supplier,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-C", name="C")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-C", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="conc@ecowrap.com", password="Str0ng!Passw0rd")
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-C",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-C",
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
            received_quantity=Decimal("100"),
            accepted_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            lot_number="LOT-C",
        )
        post_grn(grn=grn, user=self.user)
        lot = InventoryLot.objects.get(lot_number="LOT-C")
        lot.status = LotStatus.AVAILABLE
        lot.save(update_fields=["status"])

    def test_sequential_reserve_then_fifo_respects_locks(self):
        """Deterministic locking: reserve ATC then FIFO cannot over-issue free stock."""
        res = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("60"),
            uom=self.kg,
            user=self.user,
        )
        self.assertEqual(res.allocations.count(), 1)
        # Only 40 free — issuing 50 must fail
        with self.assertRaises(InsufficientStockError):
            fifo_issue(
                company=self.company,
                item=self.item,
                quantity=Decimal("50"),
                uom=self.kg,
                user=self.user,
            )
        fifo_issue(
            company=self.company,
            item=self.item,
            quantity=Decimal("40"),
            uom=self.kg,
            user=self.user,
        )
        layer = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-C")
        self.assertEqual(layer.remaining_quantity, Decimal("60.000000"))
        self.assertEqual(layer.reserved_quantity, Decimal("60.000000"))
        # Double release blocked
        release_reservation(reservation=res, user=self.user)
        with self.assertRaises(ReservationError):
            release_reservation(reservation=res, user=self.user)

    def test_duplicate_putaway_blocked(self):
        lot = InventoryLot.objects.get(lot_number="LOT-C")
        putaway = PutawayOrder.objects.create(
            company=self.company,
            putaway_number="PA-C",
            lot=lot,
            from_bin=self.bin_recv,
            to_warehouse=self.warehouse,
            to_bin=Bin.objects.create(
                warehouse=self.warehouse, code="RM-C", bin_type=BinType.RAW_MATERIAL
            ),
            quantity=Decimal("100"),
        )
        post_putaway(putaway=putaway, user=self.user)
        with self.assertRaises(WarehouseOpsError):
            post_putaway(putaway=putaway, user=self.user)
