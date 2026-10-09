"""Focused regression: post_grn bin/warehouse ownership, duplicate-post idempotency,
cross-company isolation, and transactional rollback integrity."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.exceptions import ERPError
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.company_scope import CompanyAccessDenied
from apps.organization.models import Company, Currency
from apps.procurement.commercial import PurchaseOrderStatus
from apps.procurement.inbound import (
    GateEntry,
    GateEntryStatus,
    GoodsReceiptLine,
    GoodsReceiptNote,
    GrnStatus,
)
from apps.procurement.inbound_services import InboundError, post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class PostGrnBinValidationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="BinVal", legal_name="BinVal Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-BV",
            legal_name="Sup BV",
            trading_name="Sup BV",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-BV-001",
            name="RM BV",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-BV", name="WH BV")
        self.other_warehouse = Warehouse.objects.create(
            company=self.company, code="WH-BV-OTHER", name="Other WH BV"
        )
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-BV", bin_type=BinType.RECEIVING
        )
        self.bin_other_wh = Bin.objects.create(
            warehouse=self.other_warehouse, code="RECV-OTHER", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="bv@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self):
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
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        return po, line

    def _make_grn(self, receiving_bin=None, suffix="1"):
        po, line = self._approved_po()
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-BV-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-BV-{suffix}",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=receiving_bin or self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal("100"),
            accepted_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-BV-{suffix}",
            purchase_order_line=line,
        )
        return grn

    def test_receiving_bin_from_different_warehouse_rejected(self):
        grn = self._make_grn(receiving_bin=self.bin_other_wh, suffix="X")
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "BIN_WAREHOUSE_MISMATCH")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)

    def test_receiving_bin_from_same_warehouse_accepted(self):
        grn = self._make_grn(receiving_bin=self.bin_recv, suffix="OK")
        posted = post_grn(grn=grn, user=self.user)
        self.assertEqual(posted.status, GrnStatus.POSTED)
        posted.refresh_from_db()
        self.assertEqual(posted.receiving_bin_id, self.bin_recv.id)


class DuplicateGrnPostTests(TestCase):
    """A GRN that is already POSTED must not be re-posted; second call is a no-op."""

    def setUp(self):
        self.company = Company.objects.create(name="DupPost", legal_name="DupPost Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-DP",
            legal_name="Sup DP",
            trading_name="Sup DP",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-DP-001",
            name="RM DP",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-DP", name="WH DP")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-DP", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="dp@ecowrap.com", password="Str0ng!Passw0rd")

    def _setup_posted_grn(self):
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
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()

        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-DP-1",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-DP-1",
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
            lot_number="LOT-DP-1",
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=self.user)
        grn.refresh_from_db()
        return grn, po, line

    def test_duplicate_post_raises_with_no_side_effects(self):
        grn, po, _line = self._setup_posted_grn()
        ledger_after_first = StockLedgerEntry.objects.count()
        po.refresh_from_db()
        po_status_after_first = po.status

        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "DUPLICATE_POST")

        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.POSTED)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_after_first)
        po.refresh_from_db()
        self.assertEqual(po.status, po_status_after_first)


class CrossCompanyGrnTests(TestCase):
    """GRN must reject supplier or item belonging to a different company."""

    def setUp(self):
        self.company = Company.objects.create(name="CC-G", legal_name="CC-G Ltd")
        self.other = Company.objects.create(name="CC-G-Other", legal_name="CC-G-Other Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CC",
            legal_name="Sup CC",
            trading_name="Sup CC",
            preferred_incoterm=self.fob,
        )
        self.other_supplier = Supplier.objects.create(
            company=self.other,
            code="SUP-CC-OTHER",
            legal_name="Sup CC Other",
            trading_name="Sup CC Other",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-CC-001",
            name="RM CC",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.other_item = Item.objects.create(
            company=self.other,
            sku="RM-CC-OTHER",
            name="RM CC Other",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-CC", name="WH CC")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-CC", bin_type=BinType.RECEIVING
        )
        self.other_warehouse = Warehouse.objects.create(
            company=self.other, code="WH-CC-OTHER", name="Other WH CC"
        )
        self.other_bin_recv = Bin.objects.create(
            warehouse=self.other_warehouse, code="RECV-CC-OTHER", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="cc@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self):
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
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        return po, line

    def _make_grn(self, grn_supplier=None, item=None, line=None, suffix="1"):
        po, pline = self._approved_po()
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-CC-{suffix}",
            entry_at=timezone.now(),
            supplier=grn_supplier or self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-CC-{suffix}",
            gate_entry=gate,
            supplier=grn_supplier or self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.bin_recv,
            received_at=timezone.now(),
            currency=self.npr,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=item or self.item,
            uom=self.kg,
            received_quantity=Decimal("100"),
            accepted_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-CC-{suffix}",
            purchase_order_line=line or pline,
        )
        return grn

    def test_cross_company_supplier_rejected(self):
        grn = self._make_grn(grn_supplier=self.other_supplier, suffix="SUP")
        with self.assertRaises(CompanyAccessDenied) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)

    def test_cross_company_item_rejected(self):
        grn = self._make_grn(item=self.other_item, suffix="ITEM")
        with self.assertRaises(CompanyAccessDenied) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)

    def test_cross_company_warehouse_rejected(self):
        grn = self._make_grn(suffix="WAREHOUSE")
        grn.warehouse = self.other_warehouse
        grn.receiving_bin = self.other_bin_recv
        grn.save(update_fields=["warehouse", "receiving_bin"])

        with self.assertRaises(CompanyAccessDenied) as ctx:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(ctx.exception.code, "CROSS_COMPANY_REFERENCE")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)


class TransactionalRollbackTests(TestCase):
    """post_grn must leave no partial state when any line fails validation."""

    def setUp(self):
        self.company = Company.objects.create(name="TxRB", legal_name="TxRB Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-TX",
            legal_name="Sup TX",
            trading_name="Sup TX",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-TX-001",
            name="RM TX",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-TX", name="WH TX")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-TX", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="tx@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self, qty="100"):
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
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        return po, line

    def _make_grn(self, qty="100", suffix="1"):
        po, line = self._approved_po(qty="100")
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-TX-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-TX-{suffix}",
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
            lot_number=f"LOT-TX-{suffix}",
            purchase_order_line=line,
        )
        return grn

    def test_over_receipt_raises_with_no_partial_state(self):
        grn = self._make_grn(qty="105", suffix="OR")
        ledger_before = StockLedgerEntry.objects.count()
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "OVER_RECEIPT")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)
        grn_line = grn.lines.get()
        self.assertIsNone(grn_line.lot_id)

    def test_multi_line_rollback_when_second_line_fails(self):
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
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        line2 = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()

        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-TX-ML",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-TX-ML",
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
            received_quantity=Decimal("60"),
            accepted_quantity=Decimal("60"),
            purchase_unit_cost=Decimal("10"),
            lot_number="LOT-TX-ML-1",
            purchase_order_line=line,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal("105"),
            accepted_quantity=Decimal("105"),
            purchase_unit_cost=Decimal("10"),
            lot_number="LOT-TX-ML-2",
            purchase_order_line=line2,
        )

        ledger_before = StockLedgerEntry.objects.count()
        with self.assertRaises(InboundError) as ctx:
            post_grn(grn=grn, user=self.user)
        self.assertEqual(ctx.exception.code, "OVER_RECEIPT")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(StockLedgerEntry.objects.count(), ledger_before)
        for grn_line in grn.lines.all():
            self.assertIsNone(grn_line.lot_id)
