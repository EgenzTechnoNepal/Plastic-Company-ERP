"""Phase 3 Slice A integrity hardening — reserved issue regressions."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.inventory.ledger import ReservationStatus, StockLedgerEntry, StockReservation, StockReservationAllocation, StockTxnType
from apps.inventory.models import Item, ItemType, InventoryLot, InventoryReceiptLayer, LotStatus, UnitOfMeasure
from apps.inventory.reserved_issue import ReservedIssueError, issue_reserved_stock
from apps.inventory.stock_services import fifo_issue, reserve_stock
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.commercial import SalesOrderStatus
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse


class ReservedIssueHardeningTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="H-Res", legal_name="H-Res Ltd")
        self.other = Company.objects.create(name="H-Other", legal_name="H-Other Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company, code="SUP-H", legal_name="Sup H", trading_name="Sup H", preferred_incoterm=self.fob
        )
        self.customer = Customer.objects.create(
            company=self.company, code="CUS-H", legal_name="Cust H", trading_name="Cust H"
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-H-001",
            name="FG H",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )
        self.item_b = Item.objects.create(
            company=self.company,
            sku="FG-H-002",
            name="FG H2",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-H", name="WH H")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-H", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="hres@ecowrap.com", password="Str0ng!Passw0rd")

    def _available_stock(self, qty="100", suffix="A"):
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
            received_quantity=Decimal(qty),
            accepted_quantity=Decimal(qty),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-H-{suffix}",
        )
        post_grn(grn=grn, user=self.user)
        lot = InventoryLot.objects.get(lot_number=f"LOT-H-{suffix}")
        insp = QCInspection.objects.create(
            company=self.company,
            inspection_number=f"QC-H-{suffix}",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=insp, user=self.user)
        return InventoryReceiptLayer.objects.get(lot=lot)

    def _confirmed_line(self, qty="20"):
        self._available_stock("100")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal(qty),
            user=self.user,
            warehouse=self.warehouse,
        )
        confirm_sales_order(sales_order=so, user=self.user)
        return so, line

    def test_allocation_exceeds_layer_reserved_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        alloc = res.allocations.get()
        layer = alloc.receipt_layer
        # Corrupt: allocation claims more than layer reserved
        StockReservationAllocation.objects.filter(pk=alloc.pk).update(quantity=Decimal("50"))
        res.quantity = Decimal("50")
        res.save(update_fields=["quantity"])
        layer.reserved_quantity = Decimal("20")
        layer.save(update_fields=["reserved_quantity"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("20"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "ALLOCATION_EXCEEDS_RESERVED")

    def test_corrupted_reservation_allocation_qty_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        res.quantity = Decimal("99")
        res.save(update_fields=["quantity"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "RESERVATION_ALLOCATION_QTY_MISMATCH")

    def test_inactive_layer_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        layer = res.allocations.get().receipt_layer
        layer.is_active = False
        layer.save(update_fields=["is_active"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "LAYER_INACTIVE")

    def test_expired_lot_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        lot = res.allocations.get().receipt_layer.lot
        lot.expiry_date = timezone.now().date() - timedelta(days=1)
        lot.save(update_fields=["expiry_date"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "LOT_EXPIRED")

    def test_item_mismatch_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        layer = res.allocations.get().receipt_layer
        layer.item = self.item_b
        layer.save(update_fields=["item"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertIn(ctx.exception.code, {"ITEM_MISMATCH", "LOT_ITEM_MISMATCH"})

    def test_cross_company_layer_rejected(self):
        so, line = self._confirmed_line("20")
        res = StockReservation.objects.get(reference_id=line.id)
        layer = res.allocations.get().receipt_layer
        layer.company = self.other
        layer.save(update_fields=["company"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_LAYER")

    def test_legacy_path_same_integrity_checks(self):
        layer = self._available_stock("50", "LEG")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("10"),
            user=self.user,
            warehouse=self.warehouse,
        )
        res = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("10"),
            uom=self.kg,
            user=self.user,
            warehouse=self.warehouse,
            receipt_layer=layer,
            reference_type="SALES_ORDER_LINE",
            reference_id=line.id,
        )
        # Strip allocations to force legacy receipt_layer_id path
        res.allocations.all().delete()
        res.receipt_layer = layer
        res.quantity = Decimal("10")
        res.save(update_fields=["receipt_layer", "quantity"])
        line.reserved_quantity = Decimal("10")
        line.save(update_fields=["reserved_quantity"])
        so.status = SalesOrderStatus.RESERVED
        so.save(update_fields=["status"])

        layer.is_active = False
        layer.save(update_fields=["is_active"])
        with self.assertRaises(ReservedIssueError) as ctx:
            issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("10"),
                uom=self.kg,
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "LAYER_INACTIVE")

    def test_happy_path_consumes_allocation_not_fifo(self):
        so, line = self._confirmed_line("15")
        with mock.patch("apps.inventory.stock_services.fifo_issue") as fifo_mock:
            entries = issue_reserved_stock(
                company=self.company,
                sales_order_line_id=line.id,
                quantity=Decimal("15"),
                uom=self.kg,
                user=self.user,
                reference_type="DISPATCH",
            )
            fifo_mock.assert_not_called()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].txn_type, StockTxnType.ISSUE)
        self.assertEqual(
            StockReservation.objects.filter(reference_id=line.id, status=ReservationStatus.OPEN).count(),
            0,
        )
        # Independent fifo_issue still works for non-reserved stock
        self._available_stock("30", "FIFO")
        before = StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count()
        fifo_issue(
            company=self.company,
            item=self.item,
            quantity=Decimal("5"),
            uom=self.kg,
            user=self.user,
        )
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count(), before + 1
        )
