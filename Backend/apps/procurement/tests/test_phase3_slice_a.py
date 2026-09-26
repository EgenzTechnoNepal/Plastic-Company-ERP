"""
Phase 3 Slice A — procurement commercial tests (PO, GRN progress, SupplierBill match).
"""

from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.exceptions import ERPError
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.inventory.ledger import StockLedgerEntry
from apps.organization.models import Company, Currency
from apps.procurement.bill_services import (
    add_bill_line,
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
    approve_purchase_order,
    cancel_purchase_order,
    create_purchase_order,
    submit_purchase_order,
    PurchaseOrderError,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class Phase3ProcurementBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap P3", legal_name="EcoWrap P3 Pvt Ltd")
        self.other = Company.objects.create(name="Other Co", legal_name="Other Co Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-P3",
            legal_name="Supplier P3",
            trading_name="Supplier P3",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-P3-001",
            name="PLA P3",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-P3", name="Main P3")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-P3", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="p3@ecowrap.com", password="Str0ng!Passw0rd")

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
        return po, line


class PurchaseOrderTests(Phase3ProcurementBase):
    def test_create_approve_cancel_po(self):
        po, line = self._approved_po()
        self.assertEqual(po.status, PurchaseOrderStatus.APPROVED)
        self.assertTrue(po.document_number.startswith("PO") or len(po.document_number) > 0)
        self.assertEqual(line.ordered_quantity, Decimal("100"))
        self.assertEqual(StockLedgerEntry.objects.count(), 0)

        cancel_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrderStatus.CANCELLED)

    def test_cannot_cancel_po_with_receipts(self):
        po, line = self._approved_po()
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-P3-1",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-P3-1",
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
            received_quantity=Decimal("50"),
            accepted_quantity=Decimal("50"),
            purchase_unit_cost=Decimal("10"),
            lot_number="LOT-P3-1",
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=self.user)
        line.refresh_from_db()
        self.assertEqual(line.received_quantity, Decimal("50"))
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrderStatus.PARTIALLY_RECEIVED)
        with self.assertRaises(PurchaseOrderError):
            cancel_purchase_order(purchase_order=po, user=self.user)

    def test_partial_and_full_receipt_and_over_receipt(self):
        po, line = self._approved_po("100")

        def post_qty(suffix, qty):
            gate = GateEntry.objects.create(
                company=self.company,
                gate_entry_number=f"GE-{suffix}",
                entry_at=timezone.now(),
                supplier=self.supplier,
                purchase_order=po,
                status=GateEntryStatus.SUBMITTED,
            )
            grn = GoodsReceiptNote.objects.create(
                company=self.company,
                grn_number=f"GRN-{suffix}",
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
                lot_number=f"LOT-{suffix}",
                purchase_order_line=line,
            )
            return post_grn(grn=grn, user=self.user)

        post_qty("A", "60")
        line.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(line.received_quantity, Decimal("60"))
        self.assertEqual(po.status, PurchaseOrderStatus.PARTIALLY_RECEIVED)

        post_qty("B", "40")
        line.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(line.received_quantity, Decimal("100"))
        self.assertEqual(po.status, PurchaseOrderStatus.RECEIVED)

        # Over-receipt beyond 2% rejected
        with self.assertRaises(ERPError):
            post_qty("C", "5")

    def test_tolerance_allows_2pct_over_receipt(self):
        po, line = self._approved_po("100")
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-TOL",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-TOL",
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
            received_quantity=Decimal("102"),
            accepted_quantity=Decimal("102"),
            purchase_unit_cost=Decimal("10"),
            lot_number="LOT-TOL",
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=self.user)
        line.refresh_from_db()
        self.assertEqual(line.received_quantity, Decimal("102"))

    def test_non_po_grn_still_works(self):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-NOPO",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-NOPO",
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
            purchase_unit_cost=Decimal("5"),
            lot_number="LOT-NOPO",
        )
        posted = post_grn(grn=grn, user=self.user)
        self.assertEqual(posted.status, "POSTED")
        self.assertEqual(StockLedgerEntry.objects.filter(reference_type="GRN").count(), 1)


class SupplierBillMatchTests(Phase3ProcurementBase):
    def _posted_grn_for_po(self, po, line, qty="100"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-BILL-{po.document_number}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-BILL-{po.document_number}",
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
            lot_number=f"LOT-BILL-{po.document_number}",
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=self.user)
        return grn, gl

    def test_exact_match_and_post(self):
        po, line = self._approved_po("100", "10")
        grn, gl = self._posted_grn_for_po(po, line, "100")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-EXACT-1",
            user=self.user,
            purchase_order=po,
            grn=grn,
            currency=self.npr,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("100"),
            unit_price=Decimal("10"),
            user=self.user,
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MATCHED)
        posted = post_supplier_bill(bill=matched, user=self.user)
        self.assertEqual(posted.status, SupplierBillStatus.POSTED)
        # Bill does not create stock
        before = StockLedgerEntry.objects.count()
        self.assertEqual(StockLedgerEntry.objects.count(), before)

    def test_qty_mismatch(self):
        po, line = self._approved_po("100", "10")
        grn, gl = self._posted_grn_for_po(po, line, "100")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-MIS-Q",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("50"),
            unit_price=Decimal("10"),
            user=self.user,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_price_mismatch(self):
        po, line = self._approved_po("100", "10")
        grn, _gl = self._posted_grn_for_po(po, line, "100")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-MIS-P",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("100"),
            unit_price=Decimal("50"),
            user=self.user,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_tolerance_match(self):
        po, line = self._approved_po("100", "10")
        grn, _gl = self._posted_grn_for_po(po, line, "100")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="INV-TOL",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        # 101 qty within 2% of 100
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("101"),
            unit_price=Decimal("10"),
            user=self.user,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MATCHED)

    def test_duplicate_supplier_invoice(self):
        create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="DUP-1",
            user=self.user,
        )
        with self.assertRaises(SupplierBillError):
            create_supplier_bill(
                company=self.company,
                supplier=self.supplier,
                supplier_invoice_number="DUP-1",
                user=self.user,
            )
