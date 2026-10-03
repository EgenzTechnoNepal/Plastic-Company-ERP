"""Phase 2 — LC pre-dispatch clearance blocks Gate submit / GRN post."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Company, Currency
from apps.procurement.commercial import PurchaseOrderStatus
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn, submit_gate_entry
from apps.procurement.lc_services import (
    TradeFinanceError,
    assert_lc_allows_inbound,
    attach_draft_lc_scan,
    create_letter_of_credit,
    create_proforma_invoice,
    issue_final_lc,
    record_seller_draft_ok,
    run_draft_lc_match,
    verify_pre_dispatch_packet,
)
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.procurement.trade_finance import LetterOfCreditStatus
from apps.warehouse.models import Bin, BinType, Warehouse


class LcGateEnforcementTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap LC2", legal_name="EcoWrap LC2 Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-LC2",
            legal_name="China PLA Supplier",
            trading_name="China PLA",
            preferred_incoterm=self.fob,
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-LC2-001",
            name="PLA LC2",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-LC2", name="Main LC2")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-LC2", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="lc2@ecowrap.com", password="Str0ng!Passw0rd")

    def _approved_po(self):
        po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
            incoterm=self.fob,
        )
        line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrderStatus.APPROVED)
        return po, line

    def _draft_gate(self, po, number="GE-LC2-1"):
        return GateEntry.objects.create(
            company=self.company,
            gate_entry_number=number,
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.DRAFT,
        )

    def _lc_through_final(self, po):
        pi = create_proforma_invoice(
            company=self.company,
            purchase_order=po,
            user=self.user,
            total_amount=Decimal("1000"),
            currency_code="USD",
            lead_time_days=30,
            seller_pi_number="PI-LC2",
        )
        lc = create_letter_of_credit(
            company=self.company,
            purchase_order=po,
            proforma_invoice=pi,
            user=self.user,
            bank_name="Laxmi Sunrise Bank",
            amount=Decimal("1000"),
            currency_code="USD",
        )
        attach_draft_lc_scan(
            lc,
            extracted={"amount": "1000", "currency": "USD", "beneficiary": "China PLA"},
            user=self.user,
        )
        run_draft_lc_match(lc, user=self.user)
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.AI_MATCH_PASSED)
        record_seller_draft_ok(lc, user=self.user)
        issue_final_lc(lc, final_lc_number="LC-FINAL-LC2", user=self.user)
        lc.refresh_from_db()
        return lc

    def test_submit_gate_blocked_until_docs_cleared(self):
        po, _line = self._approved_po()
        lc = self._lc_through_final(po)
        gate = self._draft_gate(po)

        with self.assertRaises(TradeFinanceError) as ctx:
            submit_gate_entry(gate=gate, user=self.user)
        self.assertEqual(ctx.exception.code, "LC_GATE_BLOCKED")

        verify_pre_dispatch_packet(
            lc,
            present_keys=["commercial_invoice", "packing_list", "bill_of_lading", "coa"],
            user=self.user,
        )
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.DOCS_CLEARED)

        updated = submit_gate_entry(gate=gate, user=self.user)
        self.assertEqual(updated.status, GateEntryStatus.SUBMITTED)

    def test_gate_without_lc_unrestricted(self):
        po, _line = self._approved_po()
        gate = self._draft_gate(po, number="GE-LC2-NO-LC")
        assert_lc_allows_inbound(po)  # no-op
        updated = submit_gate_entry(gate=gate, user=self.user)
        self.assertEqual(updated.status, GateEntryStatus.SUBMITTED)

    def test_post_grn_blocked_then_allowed(self):
        po, line = self._approved_po()
        lc = self._lc_through_final(po)
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-LC2-GRN",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-LC2-1",
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
            lot_number="LOT-LC2-1",
            purchase_order_line=line,
        )

        with self.assertRaises(TradeFinanceError):
            post_grn(grn=grn, user=self.user)

        verify_pre_dispatch_packet(
            lc,
            present_keys=["commercial_invoice", "packing_list", "bill_of_lading", "coa"],
            user=self.user,
        )
        posted = post_grn(grn=grn, user=self.user)
        self.assertTrue(posted.status)

    def test_assert_raises_inbound_compatible_error(self):
        po, _ = self._approved_po()
        self._lc_through_final(po)
        with self.assertRaises(TradeFinanceError) as ctx:
            assert_lc_allows_inbound(po)
        self.assertIn("Pre-dispatch", str(ctx.exception.detail) if hasattr(ctx.exception, "detail") else str(ctx.exception))
