"""
Phase 3 Slice A — sales commercial tests (SO reserve, dispatch issue_reserved_stock, invoice).
"""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.inventory.ledger import ReservationStatus, StockLedgerEntry, StockReservation, StockTxnType
from apps.inventory.models import Item, ItemType, InventoryLot, InventoryReceiptLayer, LotStatus, UnitOfMeasure
from apps.inventory.reserved_issue import issue_reserved_stock, ReservedIssueError
from apps.inventory.stock_services import compute_balances, fifo_issue, reserve_stock
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Supplier, Incoterm
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.commercial import DispatchNoteStatus, SalesInvoiceStatus, SalesOrderStatus
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch, DispatchError
from apps.sales.invoice_services import (
    add_invoice_line,
    create_sales_invoice,
    post_sales_invoice,
    SalesInvoiceError,
)
from apps.sales.so_services import (
    add_so_line,
    cancel_sales_order,
    confirm_sales_order,
    create_sales_order,
    SalesOrderError,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase3SalesBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap Sales", legal_name="EcoWrap Sales Pvt")
        self.other = Company.objects.create(name="OtherSales", legal_name="Other Sales Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-SO",
            legal_name="Supplier SO",
            trading_name="Supplier SO",
            preferred_incoterm=self.fob,
        )
        self.customer = Customer.objects.create(
            company=self.company,
            code="CUS-SO",
            legal_name="Customer SO",
            trading_name="Customer SO",
            credit_limit=Decimal("1000000"),
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-SO-001",
            name="FG SO",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-SO", name="SO WH")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-SO", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="so@ecowrap.com", password="Str0ng!Passw0rd")

    def _stock_available(self, qty="100", unit_cost="10", lot_suffix="A"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-SO-{lot_suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-SO-{lot_suffix}",
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
            purchase_unit_cost=Decimal(unit_cost),
            lot_number=f"LOT-SO-{lot_suffix}",
        )
        post_grn(grn=grn, user=self.user)
        lot = InventoryLot.objects.get(lot_number=f"LOT-SO-{lot_suffix}")
        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number=f"QC-SO-{lot_suffix}",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=inspection, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)
        return lot


class SalesOrderReserveTests(Phase3SalesBase):
    def test_confirm_reserves_via_allocations(self):
        self._stock_available("100")
        so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            warehouse=self.warehouse,
            currency=self.npr,
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("40"),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("20"),
        )
        confirm_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.RESERVED)
        self.assertEqual(line.reserved_quantity, Decimal("40"))
        res = StockReservation.objects.get(reference_id=line.id)
        self.assertEqual(res.status, ReservationStatus.OPEN)
        self.assertTrue(res.allocations.exists())
        layer = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-SO-A")
        self.assertEqual(layer.reserved_quantity, Decimal("40"))
        # Physical unchanged
        self.assertEqual(layer.remaining_quantity, Decimal("100"))

    def test_insufficient_atc_rejects_confirm(self):
        self._stock_available("10")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("50"),
            user=self.user,
            warehouse=self.warehouse,
        )
        with self.assertRaises(SalesOrderError) as ctx:
            confirm_sales_order(sales_order=so, user=self.user)
        self.assertEqual(getattr(ctx.exception, "code", None) or ctx.exception.default_code, "INSUFFICIENT_ATC")
        so.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.DRAFT)
        self.assertEqual(StockReservation.objects.filter(status=ReservationStatus.OPEN).count(), 0)

    def test_cancel_releases_reservation(self):
        self._stock_available("50")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("20"),
            user=self.user,
            warehouse=self.warehouse,
        )
        confirm_sales_order(sales_order=so, user=self.user)
        cancel_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.CANCELLED)
        self.assertEqual(line.reserved_quantity, Decimal("0"))
        self.assertEqual(StockReservation.objects.filter(status=ReservationStatus.OPEN).count(), 0)
        layer = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-SO-A")
        self.assertEqual(layer.reserved_quantity, Decimal("0"))


class DispatchReservedIssueTests(Phase3SalesBase):
    def _confirmed_so(self, order_qty="30"):
        self._stock_available("100")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal(order_qty),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("15"),
        )
        confirm_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        line.refresh_from_db()
        return so, line

    def test_dispatch_posts_issue_and_consumes_reservation(self):
        so, line = self._confirmed_so("30")
        layer_before = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-SO-A")
        rem_before = layer_before.remaining_quantity
        res_before = layer_before.reserved_quantity

        dn = create_dispatch_note(sales_order=so, user=self.user, warehouse=self.warehouse)
        add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal("30"), user=self.user)
        post_dispatch(dispatch=dn, user=self.user)

        dn.refresh_from_db()
        so.refresh_from_db()
        line.refresh_from_db()
        layer_before.refresh_from_db()

        self.assertEqual(dn.status, DispatchNoteStatus.POSTED)
        self.assertEqual(so.status, SalesOrderStatus.DISPATCHED)
        self.assertEqual(line.dispatched_quantity, Decimal("30"))
        self.assertEqual(line.reserved_quantity, Decimal("0"))
        self.assertEqual(layer_before.remaining_quantity, rem_before - Decimal("30"))
        self.assertEqual(layer_before.reserved_quantity, res_before - Decimal("30"))
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE, reference_type="DISPATCH").count(),
            1,
        )
        self.assertEqual(StockReservation.objects.filter(status=ReservationStatus.OPEN).count(), 0)

    def test_must_not_release_then_fifo(self):
        """Regression: issue_reserved_stock consumes exact allocations, not independent FIFO."""
        # Two layers with different costs
        self._stock_available("50", "10", "L1")
        self._stock_available("50", "99", "L2")
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("20"),
            user=self.user,
            warehouse=self.warehouse,
        )
        # Explicitly reserve only from L2 (expensive) layer
        layer2 = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-SO-L2")
        reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("20"),
            uom=self.kg,
            user=self.user,
            warehouse=self.warehouse,
            receipt_layer=layer2,
            reference_type="SALES_ORDER_LINE",
            reference_id=line.id,
        )
        line.reserved_quantity = Decimal("20")
        line.save(update_fields=["reserved_quantity"])
        so.status = SalesOrderStatus.RESERVED
        so.save(update_fields=["status"])

        entries = issue_reserved_stock(
            company=self.company,
            sales_order_line_id=line.id,
            quantity=Decimal("20"),
            uom=self.kg,
            user=self.user,
            reference_type="DISPATCH",
        )
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].receipt_layer_id, layer2.id)
        self.assertEqual(entries[0].unit_cost, Decimal("99.000000") or entries[0].unit_cost)

        layer1 = InventoryReceiptLayer.objects.get(lot__lot_number="LOT-SO-L1")
        layer1.refresh_from_db()
        layer2.refresh_from_db()
        # FIFO would have taken L1 first; reserved path must leave L1 untouched
        self.assertEqual(layer1.remaining_quantity, Decimal("50"))
        self.assertEqual(layer2.remaining_quantity, Decimal("30"))

    def test_cannot_dispatch_qc_hold(self):
        # Stock sitting in QC_HOLD — confirm should fail (no ATC)
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-HOLD",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-HOLD",
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
            received_quantity=Decimal("40"),
            accepted_quantity=Decimal("40"),
            purchase_unit_cost=Decimal("10"),
            lot_number="LOT-HOLD",
        )
        post_grn(grn=grn, user=self.user)
        so = create_sales_order(
            company=self.company, customer=self.customer, user=self.user, warehouse=self.warehouse
        )
        add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("10"),
            user=self.user,
            warehouse=self.warehouse,
        )
        with self.assertRaises(SalesOrderError):
            confirm_sales_order(sales_order=so, user=self.user)

    def test_fifo_issue_unchanged_for_non_reserved(self):
        """fifo_issue still works independently for non-dispatch callers."""
        self._stock_available("40")
        balances = compute_balances(company=self.company, item=self.item)
        self.assertEqual(balances["available_to_consume"], "40.000000")
        fifo_issue(
            company=self.company,
            item=self.item,
            quantity=Decimal("5"),
            uom=self.kg,
            user=self.user,
        )
        balances = compute_balances(company=self.company, item=self.item)
        self.assertEqual(balances["available_to_consume"], "35.000000")


class SalesInvoiceTests(Phase3SalesBase):
    def test_invoice_requires_dispatch_and_no_stock_change(self):
        self._stock_available("50")
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
            unit_price=Decimal("25"),
        )
        confirm_sales_order(sales_order=so, user=self.user)

        with self.assertRaises(SalesInvoiceError):
            create_sales_invoice(
                company=self.company,
                customer=self.customer,
                user=self.user,
                sales_order=so,
            )

        dn = create_dispatch_note(sales_order=so, user=self.user)
        add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal("10"), user=self.user)
        post_dispatch(dispatch=dn, user=self.user)

        ledger_before = StockLedgerEntry.objects.count()
        inv = create_sales_invoice(
            company=self.company,
            customer=self.customer,
            user=self.user,
            sales_order=so,
            dispatch_note=dn,
            currency=self.npr,
        )
        add_invoice_line(
            invoice=inv,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("10"),
            unit_price=Decimal("25"),
            user=self.user,
            sales_order_line=line,
        )
        post_sales_invoice(invoice=inv, user=self.user)
        inv.refresh_from_db()
        self.assertEqual(inv.status, SalesInvoiceStatus.POSTED)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)
