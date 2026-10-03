"""Phase 1 trade finance — Proforma + LC lifecycle tests."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.organization.models import Company
from apps.procurement.commercial import PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus
from apps.procurement.lc_services import (
    attach_draft_lc_scan,
    create_letter_of_credit,
    create_proforma_invoice,
    issue_final_lc,
    lc_allows_gate_entry,
    record_seller_draft_ok,
    run_draft_lc_match,
    verify_pre_dispatch_packet,
)
from apps.procurement.models import Supplier
from apps.procurement.trade_finance import LetterOfCreditStatus


User = get_user_model()


class TradeFinancePhase1Tests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="EcoWrap TF", legal_name="EcoWrap TF Pvt Ltd")
        self.user = User.objects.create_superuser(email="tf@ecowrap.com", password="Str0ng!Passw0rd")
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="V-1",
            legal_name="Nepal Biopolymers Pvt. Ltd.",
            trading_name="Nepal Biopolymers",
            is_active=True,
        )
        self.po = PurchaseOrder.objects.create(
            company=self.company,
            document_number="PO-T-001",
            supplier=self.supplier,
            status=PurchaseOrderStatus.SENT,
        )

    def test_draft_match_seller_final_and_pre_dispatch(self):
        pi = create_proforma_invoice(
            company=self.company,
            purchase_order=self.po,
            user=self.user,
            total_amount=Decimal("125000"),
            currency_code="USD",
            lead_time_days=30,
            seller_pi_number="PI-99",
        )
        lc = create_letter_of_credit(
            company=self.company,
            purchase_order=self.po,
            proforma_invoice=pi,
            user=self.user,
            bank_name="Laxmi Sunrise Bank",
            amount=Decimal("125000"),
            currency_code="USD",
        )
        self.assertEqual(lc.status, LetterOfCreditStatus.DRAFT)

        attach_draft_lc_scan(
            lc,
            extracted={
                "amount": "125000",
                "currency": "USD",
                "beneficiary": "Nepal Biopolymers",
            },
            user=self.user,
        )
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.DRAFT_LC_SCANNED)

        run_draft_lc_match(lc, user=self.user)
        lc.refresh_from_db()
        self.assertTrue(lc.match_result.get("passed"))
        self.assertEqual(lc.status, LetterOfCreditStatus.AI_MATCH_PASSED)

        record_seller_draft_ok(lc, user=self.user)
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.SELLER_APPROVED)

        issue_final_lc(lc, final_lc_number="LC-FINAL-1", user=self.user)
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.FINAL_ISSUED)

        ok, _ = lc_allows_gate_entry(lc)
        self.assertFalse(ok)

        verify_pre_dispatch_packet(
            lc,
            present_keys=[
                "commercial_invoice",
                "packing_list",
                "bill_of_lading",
                "coa",
            ],
            user=self.user,
        )
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.DOCS_CLEARED)
        self.assertIn("okay, you can dispatch", lc.pre_dispatch_message.lower())
        ok, _ = lc_allows_gate_entry(lc)
        self.assertTrue(ok)

    def test_pre_dispatch_missing_docs_message(self):
        pi = create_proforma_invoice(
            company=self.company,
            purchase_order=self.po,
            user=self.user,
            total_amount=Decimal("1000"),
            currency_code="USD",
        )
        lc = create_letter_of_credit(
            company=self.company,
            purchase_order=self.po,
            proforma_invoice=pi,
            user=self.user,
            amount=Decimal("1000"),
        )
        attach_draft_lc_scan(lc, extracted={"amount": "1000", "currency": "USD"}, user=self.user)
        run_draft_lc_match(lc, user=self.user)
        record_seller_draft_ok(lc, user=self.user)
        issue_final_lc(lc, final_lc_number="LC-2", user=self.user)
        verify_pre_dispatch_packet(lc, present_keys=["commercial_invoice"], user=self.user)
        lc.refresh_from_db()
        self.assertEqual(lc.status, LetterOfCreditStatus.DOCS_BLOCKED)
        self.assertIn("left out as per LC", lc.pre_dispatch_message)
