"""Phase 3 Slice A integrity hardening — PO/GRN + 3-way match."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.bill_services import (
    SupplierBillError,
    add_bill_line,
    create_supplier_bill,
    match_supplier_bill,
)
from apps.procurement.commercial import (
    PurchaseOrderStatus,
    SupplierBillMatchStatus,
)
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import InboundError, post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class HardeningProcurementBase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="H-Proc", legal_name="H-Proc Ltd")
        self.other = Company.objects.create(name="H-Proc-O", legal_name="H-Proc-O Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.usd, _ = Currency.objects.get_or_create(code="USD", defaults={"name": "USD"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company, code="SUP-HP", legal_name="Sup HP", trading_name="Sup HP", preferred_incoterm=self.fob
        )
        self.supplier_b = Supplier.objects.create(
            company=self.company, code="SUP-HP2", legal_name="Sup HP2", trading_name="Sup HP2", preferred_incoterm=self.fob
        )
        self.other_supplier = Supplier.objects.create(
            company=self.other, code="SUP-O", legal_name="Sup O", trading_name="Sup O", preferred_incoterm=self.fob
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-HP-001",
            name="RM HP",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.item_b = Item.objects.create(
            company=self.company,
            sku="RM-HP-002",
            name="RM HP2",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.other_item = Item.objects.create(
            company=self.other,
            sku="RM-O-001",
            name="RM O",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-HP", name="WH HP")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-HP", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="hproc@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self, qty="100", price="10", tax="0", supplier=None, currency=None):
        po = create_purchase_order(
            company=self.company,
            supplier=supplier or self.supplier,
            user=self.user,
            currency=currency or self.npr,
            destination_warehouse=self.warehouse,
        )
        line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal(qty),
            user=self.user,
            unit_price=Decimal(price),
            tax_pct=Decimal(tax),
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        return po, line

    def _make_grn(self, *, po=None, line=None, qty="100", item=None, supplier=None, suffix="1"):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-HP-{suffix}",
            entry_at=timezone.now(),
            supplier=supplier or self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-HP-{suffix}",
            gate_entry=gate,
            supplier=supplier or self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
        )
        gl = GoodsReceiptLine.objects.create(
            grn=grn,
            item=item or self.item,
            uom=self.kg,
            received_quantity=Decimal(qty),
            accepted_quantity=Decimal(qty),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-HP-{suffix}",
            purchase_order_line=line,
        )
        return grn, gl


class PoGrnIntegrityTests(HardeningProcurementBase):
    def test_cross_company_po_line_rejected(self):
        po, line = self._approved_po()
        from apps.procurement.commercial import PurchaseOrder

        PurchaseOrder.objects.filter(pk=po.pk).update(company=self.other)
        grn, _gl = self._make_grn(po=po, line=line, suffix="XC")
        before = StockLedgerEntry.objects.count()
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_PO")
        self.assertEqual(StockLedgerEntry.objects.count(), before)

    def test_supplier_mismatch_rejected(self):
        po, line = self._approved_po()
        grn, _gl = self._make_grn(po=po, line=line, supplier=self.supplier_b, suffix="SM")
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "SUPPLIER_MISMATCH")

    def test_item_mismatch_rejected(self):
        po, line = self._approved_po()
        grn, _gl = self._make_grn(po=po, line=line, item=self.item_b, suffix="IM")
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "ITEM_MISMATCH")

    def test_invalid_po_state_rejected(self):
        po = create_purchase_order(
            company=self.company, supplier=self.supplier, user=self.user, currency=self.npr
        )
        line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("50"),
            user=self.user,
            unit_price=Decimal("10"),
        )
        # DRAFT — not receivable
        grn, _gl = self._make_grn(po=po, line=line, qty="10", suffix="ST")
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "PO_NOT_RECEIVABLE")
        self.assertEqual(po.status, PurchaseOrderStatus.DRAFT)

    def test_non_po_grn_still_allowed(self):
        grn, _gl = self._make_grn(line=None, suffix="NP")
        posted = post_grn(grn=grn, user=self.user)
        self.assertEqual(posted.status, "POSTED")
        self.assertEqual(StockLedgerEntry.objects.filter(reference_type="GRN").count(), 1)


class ThreeWayMatchHardeningTests(HardeningProcurementBase):
    def _posted(self, qty="100", price="10", tax="0"):
        po, line = self._approved_po(qty, price, tax)
        grn, gl = self._make_grn(po=po, line=line, qty=qty, suffix=f"B{qty}")
        post_grn(grn=grn, user=self.user)
        return po, line, grn, gl

    def test_exact_match(self):
        po, line, grn, gl = self._posted("100", "10", "0")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-EX",
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
            tax_pct=Decimal("0"),
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MATCHED)

    def test_within_tolerance(self):
        po, line, grn, gl = self._posted("100", "10", "0")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-TOL",
            user=self.user,
            purchase_order=po,
            grn=grn,
            currency=self.npr,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("101"),
            unit_price=Decimal("10"),
            user=self.user,
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.TOLERANCE_MATCHED)

    def test_qty_mismatch(self):
        po, line, grn, gl = self._posted()
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-Q",
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
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_price_mismatch(self):
        po, line, grn, gl = self._posted()
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-P",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("100"),
            unit_price=Decimal("99"),
            user=self.user,
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_tax_mismatch(self):
        po, line, grn, gl = self._posted("100", "10", "13")
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-T",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        add_bill_line(
            bill=bill,
            item=self.item,
            uom=self.kg,
            quantity=Decimal("100"),
            unit_price=Decimal("10"),
            user=self.user,
            tax_pct=Decimal("0"),
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_currency_mismatch(self):
        po, line, grn, gl = self._posted()
        with self.assertRaises(SupplierBillError) as ctx:
            create_supplier_bill(
                company=self.company,
                supplier=self.supplier,
                supplier_invoice_number="M-C",
                user=self.user,
                purchase_order=po,
                grn=grn,
                currency=self.usd,
            )
        self.assertEqual(ctx.exception.code, "CURRENCY_MISMATCH")

    def test_item_mismatch(self):
        po, line, grn, gl = self._posted()
        bill = create_supplier_bill(
            company=self.company,
            supplier=self.supplier,
            supplier_invoice_number="M-I",
            user=self.user,
            purchase_order=po,
            grn=grn,
        )
        add_bill_line(
            bill=bill,
            item=self.item_b,
            uom=self.kg,
            quantity=Decimal("100"),
            unit_price=Decimal("10"),
            user=self.user,
            purchase_order_line=line,
            grn_line=gl,
        )
        matched = match_supplier_bill(bill=bill, user=self.user)
        self.assertEqual(matched.match_status, SupplierBillMatchStatus.MISMATCHED)

    def test_supplier_mismatch_on_create(self):
        po, line = self._approved_po()
        grn, gl = self._make_grn(po=po, line=line, suffix="SS")
        post_grn(grn=grn, user=self.user)
        with self.assertRaises(SupplierBillError) as ctx:
            create_supplier_bill(
                company=self.company,
                supplier=self.supplier_b,
                supplier_invoice_number="M-S",
                user=self.user,
                purchase_order=po,
                grn=grn,
            )
        self.assertEqual(ctx.exception.code, "SUPPLIER_MISMATCH")

    def test_unrelated_po_grn(self):
        po1, line1 = self._approved_po("100")
        po2, line2 = self._approved_po("50")
        grn2, gl2 = self._make_grn(po=po2, line=line2, qty="50", suffix="UR")
        post_grn(grn=grn2, user=self.user)
        with self.assertRaises(SupplierBillError) as ctx:
            create_supplier_bill(
                company=self.company,
                supplier=self.supplier,
                supplier_invoice_number="M-UR",
                user=self.user,
                purchase_order=po1,
                grn=grn2,
            )
        self.assertEqual(ctx.exception.code, "GRN_PO_UNRELATED")
