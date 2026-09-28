"""
Phase 3 Slice B MUST — PO lifecycle, bill APPROVED_FOR_AP freeze.
"""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.bill_services import (
    add_bill_line,
    approve_for_ap,
    create_supplier_bill,
    match_supplier_bill,
    post_supplier_bill,
    SupplierBillError,
)
from apps.procurement.commercial import (
    PurchaseOrderStatus,
    SupplierBillMatchStatus,
    SupplierBillStatus,
)
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    amend_purchase_order,
    approve_purchase_order,
    cancel_po_line,
    close_purchase_order,
    create_purchase_order,
    mark_po_sent,
    submit_purchase_order,
    PurchaseOrderError,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase3SliceBProcurementBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap P3B", legal_name="EcoWrap P3B Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-P3B",
            legal_name="Supplier P3B",
            trading_name="Supplier P3B",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-P3B-001",
            name="PLA P3B",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-P3B", name="Main P3B")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-P3B", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="p3b@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self, qty="100", price="10"):
        po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
            destination_warehouse=self.warehouse,
        )
        line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal(qty),
            user=self.user,
            unit_price=Decimal(price),
            tax_pct=Decimal("0"),
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        line.refresh_from_db()
        return po, line

    def _receive(self, po, line, qty="40"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-P3B-{GateEntry.objects.count() + 1}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-P3B-{GoodsReceiptNote.objects.count() + 1}",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
        )
        gl = GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal(qty),
            accepted_quantity=Decimal(qty),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-P3B-{GoodsReceiptLine.objects.count() + 1}",
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=self.user)
        line.refresh_from_db()
        po.refresh_from_db()
        return grn, gl


class PurchaseOrderLifecycleTests(Phase3SliceBProcurementBase):
    def test_mark_sent_close_requires_zero_remaining(self):
        po, line = self._approved_po()
        sent = mark_po_sent(purchase_order=po, user=self.user)
        self.assertEqual(sent.status, PurchaseOrderStatus.SENT)
        self.assertEqual(StockLedgerEntry.objects.count(), 0)

        with self.assertRaises(PurchaseOrderError) as ctx:
            close_purchase_order(purchase_order=po, user=self.user)
        self.assertEqual(ctx.exception.code, "REMAINING_RECEIVABLE")

        cancel_po_line(purchase_order_line=line, user=self.user)
        line.refresh_from_db()
        self.assertEqual(line.cancelled_quantity, Decimal("100.000000"))
        closed = close_purchase_order(purchase_order=po, user=self.user)
        self.assertEqual(closed.status, PurchaseOrderStatus.CLOSED)
        self.assertIsNotNone(closed.closed_at)

    def test_cancel_line_partial_then_close_after_receipt(self):
        po, line = self._approved_po(qty="100")
        mark_po_sent(purchase_order=po, user=self.user)
        self._receive(po, line, qty="40")
        cancel_po_line(purchase_order_line=line, quantity=Decimal("60"), user=self.user)
        line.refresh_from_db()
        self.assertEqual(line.cancelled_quantity, Decimal("60.000000"))
        self.assertEqual(line.remaining_receivable, Decimal("0.000000"))
        closed = close_purchase_order(purchase_order=po, user=self.user)
        self.assertEqual(closed.status, PurchaseOrderStatus.CLOSED)

    def test_amend_price_blocked_after_receipt_ok_before(self):
        po, line = self._approved_po()
        amend_purchase_order(
            purchase_order=po,
            user=self.user,
            notes="ship ASAP",
            line_updates=[{"line_id": str(line.id), "unit_price": "12"}],
        )
        po.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(po.revision_no, 2)
        self.assertEqual(line.unit_price, Decimal("12.000000"))

        self._receive(po, line, qty="10")
        with self.assertRaises(PurchaseOrderError) as ctx:
            amend_purchase_order(
                purchase_order=po,
                user=self.user,
                line_updates=[{"line_id": str(line.id), "unit_price": "15"}],
            )
        self.assertEqual(ctx.exception.code, "PRICE_LOCKED_AFTER_RECEIPT")

    def test_amend_ordered_cannot_drop_below_received(self):
        po, line = self._approved_po()
        self._receive(po, line, qty="30")
        with self.assertRaises(PurchaseOrderError) as ctx:
            amend_purchase_order(
                purchase_order=po,
                user=self.user,
                line_updates=[{"line_id": str(line.id), "ordered_quantity": "20"}],
            )
        self.assertEqual(ctx.exception.code, "ORDERED_BELOW_RECEIVED")


class SupplierBillApproveTests(Phase3SliceBProcurementBase):
    def _matched_bill(self):
        po, line = self._approved_po(qty="50", price="10")
        mark_po_sent(purchase_order=po, user=self.user)
        grn, gl = self._receive(po, line, qty="50")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-P3B-1",
            user=self.user,
            purchase_order=po,
            grn=grn,
            currency=self.npr,
            exchange_rate=Decimal("1.25"),
            discount_pct=Decimal("10"),
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("50"),
            unit_price=Decimal("10"),
            user=self.user,
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertIn(
            matched.match_status,
            {SupplierBillMatchStatus.MATCHED, SupplierBillMatchStatus.TOLERANCE_MATCHED},
        )
        return matched

    def test_approve_for_ap_freezes_and_blocks_edit(self):
        bill = self._matched_bill()
        approved = approve_for_ap(bill=bill, user=self.user)
        self.assertEqual(approved.status, SupplierBillStatus.APPROVED_FOR_AP)
        self.assertTrue(approved.commercials_frozen)
        self.assertEqual(approved.exchange_rate, Decimal("1.25000000"))
        self.assertGreater(approved.discount_amount, 0)
        self.assertEqual(StockLedgerEntry.objects.filter(txn_type="ISSUE").count(), 0)

        with self.assertRaises(SupplierBillError):
            add_bill_line(
                bill=approved,
                item=self.item,
                uom=self.kg,
                quantity=Decimal("1"),
                unit_price=Decimal("1"),
                user=self.user,
            )

        with self.assertRaises(SupplierBillError) as ctx:
            match_supplier_bill(bill=approved, user=self.user)
        self.assertEqual(ctx.exception.code, "BILL_FROZEN")

        posted = post_supplier_bill(bill=approved, user=self.user)
        self.assertEqual(posted.status, SupplierBillStatus.POSTED)
        self.assertTrue(posted.commercials_frozen)

    def test_approve_requires_match(self):
        po, line = self._approved_po(qty="10")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-P3B-UM",
            user=self.user,
            purchase_order=po,
            currency=self.npr,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("10"),
            unit_price=Decimal("10"),
            user=self.user,
            purchase_order_line=line,
        )
        with self.assertRaises(SupplierBillError) as ctx:
            approve_for_ap(bill=bill, user=self.user)
        self.assertEqual(ctx.exception.code, "MATCH_REQUIRED")
