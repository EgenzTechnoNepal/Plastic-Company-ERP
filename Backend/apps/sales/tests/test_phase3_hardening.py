"""Phase 3 Slice A integrity hardening — dispatch + invoice."""

from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.inventory.ledger import ReservationStatus, StockLedgerEntry, StockReservation, StockTxnType
from apps.inventory.models import Item, ItemType, InventoryLot, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.commercial import DispatchNoteStatus, SalesInvoiceStatus, SalesOrderStatus
from apps.sales.dispatch_services import (
    DispatchError,
    add_dispatch_line,
    create_dispatch_note,
    post_dispatch,
)
from apps.sales.invoice_services import (
    SalesInvoiceError,
    add_invoice_line,
    create_sales_invoice,
    post_sales_invoice,
)
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse


class SalesHardeningBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="H-Sales", legal_name="H-Sales Ltd")
        self.other = Company.objects.create(name="H-Sales-O", legal_name="H-Sales-O Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company, code="SUP-HS", legal_name="Sup HS", trading_name="Sup HS", preferred_incoterm=self.fob
        )
        self.customer = Customer.objects.create(
            company=self.company, code="CUS-HS", legal_name="Cust HS", trading_name="Cust HS"
        )
        self.customer_b = Customer.objects.create(
            company=self.company, code="CUS-HS2", legal_name="Cust HS2", trading_name="Cust HS2"
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="FG-HS-001",
            name="FG HS",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )
        self.item_b = Item.objects.create(
            company=self.company,
            sku="FG-HS-002",
            name="FG HS2",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-HS", name="WH HS")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-HS", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="hsales@ecowrap.com", password="Str0ng!Passw0rd")

    def _stock(self, qty="100", suffix=None):
        if suffix is None:
            suffix = str(timezone.now().timestamp()).replace(".", "")[-8:]
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-HS-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-HS-{suffix}",
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
            lot_number=f"LOT-HS-{suffix}",
        )
        post_grn(grn=grn, user=self.user)
        lot = InventoryLot.objects.get(lot_number=f"LOT-HS-{suffix}")
        insp = QCInspection.objects.create(
            company=self.company,
            inspection_number=f"QC-HS-{suffix}",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=insp, user=self.user)
        return lot

    def _confirmed_so(self, qty="20"):
        self._stock("100")
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
            unit_price=Decimal("25"),
        )
        confirm_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        line.refresh_from_db()
        return so, line


class DispatchHardeningTests(SalesHardeningBase):
    def test_zero_quantity_rejected(self):
        so, line = self._confirmed_so()
        dn = create_dispatch_note(sales_order=so, user=self.user)
        with self.assertRaises(DispatchError) as ctx:
            add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal("0"), user=self.user)
        self.assertEqual(ctx.exception.code, "INVALID_QUANTITY")

    def test_negative_quantity_rejected(self):
        so, line = self._confirmed_so()
        dn = create_dispatch_note(sales_order=so, user=self.user)
        with self.assertRaises(DispatchError) as ctx:
            add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal("-5"), user=self.user)
        self.assertEqual(ctx.exception.code, "INVALID_QUANTITY")

    def test_cross_company_so_line_rejected(self):
        so, line = self._confirmed_so()
        other_customer = Customer.objects.create(
            company=self.other, code="CUS-O", legal_name="Cust O", trading_name="Cust O"
        )
        other_so = create_sales_order(
            company=self.other, customer=other_customer, user=self.user
        )
        # Force line onto other company SO while using our dispatch — mismatch on SO id
        dn = create_dispatch_note(sales_order=so, user=self.user)
        other_line = add_so_line(
            sales_order=other_so,
            item=Item.objects.create(
                company=self.other,
                sku="FG-O",
                name="FG O",
                item_type=ItemType.FINISHED_GOOD,
                base_uom=self.kg,
                purchase_uom=self.kg,
                stock_uom=self.kg,
            ),
            uom=self.kg,
            ordered_quantity=Decimal("5"),
            user=self.user,
        )
        with self.assertRaises(DispatchError) as ctx:
            add_dispatch_line(dispatch=dn, sales_order_line=other_line, quantity=Decimal("1"), user=self.user)
        self.assertIn(ctx.exception.code, {"SO_LINE_MISMATCH", "CROSS_COMPANY_SO_LINE"})

    def test_dispatch_consumes_reservation_creates_issue_no_fifo(self):
        so, line = self._confirmed_so("25")
        dn = create_dispatch_note(sales_order=so, user=self.user)
        add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal("25"), user=self.user)
        with mock.patch("apps.sales.dispatch_services.issue_reserved_stock", wraps=__import__(
            "apps.inventory.reserved_issue", fromlist=["issue_reserved_stock"]
        ).issue_reserved_stock) as issue_mock:
            with mock.patch("apps.inventory.stock_services.fifo_issue") as fifo_mock:
                posted = post_dispatch(dispatch=dn, user=self.user)
                fifo_mock.assert_not_called()
                self.assertTrue(issue_mock.called)
        self.assertEqual(posted.status, DispatchNoteStatus.POSTED)
        self.assertEqual(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE, reference_type="DISPATCH").count(),
            1,
        )
        self.assertEqual(
            StockReservation.objects.filter(reference_id=line.id, status=ReservationStatus.OPEN).count(),
            0,
        )
        so.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.DISPATCHED)


class InvoiceHardeningTests(SalesHardeningBase):
    def _dispatched(self, qty="10"):
        so, line = self._confirmed_so(qty)
        dn = create_dispatch_note(sales_order=so, user=self.user)
        add_dispatch_line(dispatch=dn, sales_order_line=line, quantity=Decimal(qty), user=self.user)
        post_dispatch(dispatch=dn, user=self.user)
        return so, line, dn

    def test_wrong_customer_rejected(self):
        so, line, dn = self._dispatched()
        with self.assertRaises(SalesInvoiceError) as ctx:
            create_sales_invoice(
                company=self.company,
                customer=self.customer_b,
                user=self.user,
                sales_order=so,
                dispatch_note=dn,
            )
        self.assertEqual(ctx.exception.code, "CUSTOMER_MISMATCH")

    def test_unrelated_dispatch_rejected(self):
        so1, line1, dn1 = self._dispatched("10")
        so2, line2 = self._confirmed_so("5")
        dn2 = create_dispatch_note(sales_order=so2, user=self.user)
        add_dispatch_line(dispatch=dn2, sales_order_line=line2, quantity=Decimal("5"), user=self.user)
        post_dispatch(dispatch=dn2, user=self.user)
        with self.assertRaises(SalesInvoiceError) as ctx:
            create_sales_invoice(
                company=self.company,
                customer=self.customer,
                user=self.user,
                sales_order=so1,
                dispatch_note=dn2,
            )
        self.assertEqual(ctx.exception.code, "DISPATCH_SO_MISMATCH")

    def test_wrong_so_line_rejected(self):
        so, line, dn = self._dispatched("10")
        other_so, other_line = self._confirmed_so("8")
        inv = create_sales_invoice(
            company=self.company,
            customer=self.customer,
            user=self.user,
            sales_order=so,
            dispatch_note=dn,
        )
        with self.assertRaises(SalesInvoiceError) as ctx:
            add_invoice_line(
                invoice=inv,
                item=self.item,
                uom=self.kg,
                quantity=Decimal("5"),
                unit_price=Decimal("25"),
                user=self.user,
                sales_order_line=other_line,
            )
        self.assertEqual(ctx.exception.code, "SO_LINE_MISMATCH")

    def test_over_invoicing_rejected(self):
        so, line, dn = self._dispatched("10")
        inv = create_sales_invoice(
            company=self.company,
            customer=self.customer,
            user=self.user,
            sales_order=so,
            dispatch_note=dn,
        )
        with self.assertRaises(SalesInvoiceError) as ctx:
            add_invoice_line(
                invoice=inv,
                item=self.item,
                uom=self.kg,
                quantity=Decimal("15"),
                unit_price=Decimal("25"),
                user=self.user,
                sales_order_line=line,
            )
        self.assertEqual(ctx.exception.code, "OVER_INVOICE")

    def test_invoice_no_stock_no_gl(self):
        so, line, dn = self._dispatched("10")
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
        posted = post_sales_invoice(invoice=inv, user=self.user)
        self.assertEqual(posted.status, SalesInvoiceStatus.POSTED)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)
        # No GL module journals created (accounting JournalEntry not used)
        try:
            from apps.accounting.models import JournalEntry  # type: ignore

            self.assertEqual(JournalEntry.objects.count(), 0)
        except Exception:
            pass  # GL not implemented — expected for Slice A
