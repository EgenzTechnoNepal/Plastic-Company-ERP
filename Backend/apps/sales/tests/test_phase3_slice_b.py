"""
Phase 3 Slice B MUST — SO line cancel, fulfillment flags, invoice cancel/freeze.
"""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.inventory.ledger import ReservationStatus, StockLedgerEntry, StockReservation, StockTxnType
from apps.inventory.models import Item, ItemType, InventoryLot, LotStatus, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Supplier, Incoterm
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.commercial import FulfillmentFlag, SalesInvoiceStatus, SalesOrderStatus
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.invoice_services import (
    add_invoice_line,
    cancel_sales_invoice,
    create_sales_invoice,
    post_sales_invoice,
    SalesInvoiceError,
)
from apps.sales.so_services import (
    add_so_line,
    cancel_so_line,
    confirm_sales_order,
    create_sales_order,
    set_so_fulfillment_flags,
    SalesOrderError,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase3SliceBSalesBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap Sales B", legal_name="EcoWrap Sales B Pvt")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-SOB",
            legal_name="Supplier SOB",
            trading_name="Supplier SOB",
            preferred_incoterm=self.fob,
        )
        self.customer = Customer.objects.create(
            company=self.company,
            code="CUS-SOB",
            legal_name="Customer SOB",
            trading_name="Customer SOB",
            credit_limit=Decimal("1000000"),
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-SOB-001",
            name="FG SOB",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-SOB", name="SOB WH")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-SOB", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="sob@ecowrap.com", password="Str0ng!Passw0rd")

    def _stock_available(self, qty="100", unit_cost="10", lot_suffix="A"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-SOB-{lot_suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-SOB-{lot_suffix}",
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
            lot_number=f"LOT-SOB-{lot_suffix}",
        )
        post_grn(grn=grn, user=self.user)
        lot = InventoryLot.objects.get(lot_number=f"LOT-SOB-{lot_suffix}")
        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number=f"QC-SOB-{lot_suffix}",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=inspection, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

    def _confirmed_so(self, qty="50"):
        self._stock_available(qty="100", lot_suffix=f"S{StockReservation.objects.count()}")
        so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            currency=self.npr,
            warehouse=self.warehouse,
        )
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal(qty),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("20"),
        )
        so = confirm_sales_order(sales_order=so, user=self.user)
        line.refresh_from_db()
        return so, line


class SalesOrderLifecycleTests(Phase3SliceBSalesBase):
    def test_cancel_so_line_releases_reservation(self):
        so, line = self._confirmed_so(qty="40")
        open_before = StockReservation.objects.filter(
            reference_id=line.id, status=ReservationStatus.OPEN
        ).count()
        self.assertGreaterEqual(open_before, 1)
        issue_before = StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count()

        cancel_so_line(sales_order_line=line, quantity=Decimal("40"), user=self.user)
        line.refresh_from_db()
        so.refresh_from_db()
        self.assertEqual(line.cancelled_quantity, Decimal("40.000000"))
        self.assertEqual(
            StockReservation.objects.filter(reference_id=line.id, status=ReservationStatus.OPEN).count(),
            0,
        )
        # Release may write RESERVATION_RELEASE state events; must not ISSUE stock.
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count(),
            issue_before,
        )
        self.assertEqual(so.status, SalesOrderStatus.CANCELLED)

    def test_cannot_cancel_dispatched_qty(self):
        so, line = self._confirmed_so(qty="30")
        dn = create_dispatch_note(sales_order=so, user=self.user, warehouse=self.warehouse)
        add_dispatch_line(
            dispatch=dn, sales_order_line=line, quantity=Decimal("30"), user=self.user
        )
        post_dispatch(dispatch=dn, user=self.user)
        line.refresh_from_db()
        with self.assertRaises(SalesOrderError) as ctx:
            cancel_so_line(sales_order_line=line, user=self.user)
        self.assertEqual(ctx.exception.code, "NOTHING_TO_CANCEL")

    def test_fulfillment_flags_no_ledger(self):
        so, _line = self._confirmed_so(qty="10")
        ledger_before = StockLedgerEntry.objects.count()
        so = set_so_fulfillment_flags(
            sales_order=so,
            user=self.user,
            pick_status=FulfillmentFlag.DONE,
            pack_status=FulfillmentFlag.DONE,
            promised_delivery_date=timezone.now().date(),
        )
        self.assertEqual(so.pick_status, FulfillmentFlag.DONE)
        self.assertEqual(so.pack_status, FulfillmentFlag.DONE)
        self.assertIsNotNone(so.promised_delivery_date)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count(),
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).count(),
        )


class SalesInvoiceSliceBTests(Phase3SliceBSalesBase):
    def test_draft_cancel_and_post_freezes(self):
        so, line = self._confirmed_so(qty="20")
        dn = create_dispatch_note(sales_order=so, user=self.user, warehouse=self.warehouse)
        add_dispatch_line(
            dispatch=dn, sales_order_line=line, quantity=Decimal("20"), user=self.user
        )
        post_dispatch(dispatch=dn, user=self.user)

        draft = create_sales_invoice(
            company=self.company,
            customer=self.customer,
            user=self.user,
            sales_order=so,
            dispatch_note=dn,
            currency=self.npr,
            exchange_rate=Decimal("1.1"),
        )
        cancelled = cancel_sales_invoice(invoice=draft, user=self.user)
        self.assertEqual(cancelled.status, SalesInvoiceStatus.CANCELLED)

        inv = create_sales_invoice(
            company=self.company,
            customer=self.customer,
            user=self.user,
            sales_order=so,
            dispatch_note=dn,
            currency=self.npr,
            exchange_rate=Decimal("1.1"),
        )
        add_invoice_line(
            invoice=inv,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("20"),
            unit_price=Decimal("20"),
            user=self.user,
            sales_order_line=line,
        )
        posted = post_sales_invoice(invoice=inv, user=self.user)
        self.assertEqual(posted.status, SalesInvoiceStatus.POSTED)
        self.assertTrue(posted.commercials_frozen)
        self.assertEqual(posted.exchange_rate, Decimal("1.10000000"))

        with self.assertRaises(SalesInvoiceError):
            cancel_sales_invoice(invoice=posted, user=self.user)
        with self.assertRaises(SalesInvoiceError):
            add_invoice_line(
                invoice=posted,
                item=self.item,
                uom=self.kg,
                quantity=Decimal("1"),
                unit_price=Decimal("1"),
                user=self.user,
            )
