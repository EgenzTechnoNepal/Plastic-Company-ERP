"""seed_m2_demo_chain: deterministic, fully linked through typed FKs, and safe to re-run."""

from decimal import Decimal

from django.core.management.base import CommandError
from django.test import TestCase

from apps.accounts.models import UserRole
from apps.inventory.ledger import StockLedgerEntry, StockTxnType
from apps.inventory.models import InventoryLot, LandedCostDocument, LotStatus
from apps.inventory.stock_services import compute_balances
from apps.organization.models import Company
from apps.procurement.commercial import PurchaseOrder, SupplierBill
from apps.procurement.inbound import GateEntry, GoodsReceiptNote
from apps.procurement.trade_finance import LetterOfCredit, LetterOfCreditStatus, ProformaInvoice
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.sales.commercial import DispatchNote, DispatchNoteStatus, SalesInvoice, SalesInvoiceStatus, SalesOrder
from apps.system.management.commands import seed_m2_demo_chain as seed
from apps.warehouse.models import Bin, BinType
from apps.warehouse.operations import OpsDocStatus, PutawayOrder

COUNTED = [
    PurchaseOrder,
    ProformaInvoice,
    LetterOfCredit,
    GateEntry,
    GoodsReceiptNote,
    InventoryLot,
    QCInspection,
    LandedCostDocument,
    PutawayOrder,
    SupplierBill,
    SalesOrder,
    DispatchNote,
    SalesInvoice,
    StockLedgerEntry,
]


def _counts():
    return {model.__name__: model.objects.count() for model in COUNTED}


class SeedM2DemoChainTests(TestCase):
    def test_full_chain_is_linked_and_rerun_safe(self):
        first = seed.run(interactive=False)
        counts = _counts()
        second = seed.run(interactive=False)

        self.assertEqual(_counts(), counts, "re-running the seed must not create duplicates")
        self.assertEqual(first, second)

        company = Company.objects.get(pk=first["company_id"])
        po = PurchaseOrder.objects.get(company=company, document_number=seed.PO_DOC)
        self.assertEqual(po.supplier.code, seed.SUP_CN)

        pi = ProformaInvoice.objects.get(company=company, document_number=seed.PI_DOC)
        lc = LetterOfCredit.objects.get(company=company, document_number=seed.LC_DOC)
        self.assertEqual(pi.purchase_order_id, po.id)
        self.assertEqual(lc.purchase_order_id, po.id)
        self.assertEqual(lc.proforma_invoice_id, pi.id)
        self.assertEqual(lc.status, LetterOfCreditStatus.DOCS_CLEARED)

        gate = GateEntry.objects.get(company=company, gate_entry_number=seed.GATE_DOC)
        grn = GoodsReceiptNote.objects.get(company=company, grn_number=seed.GRN_DOC)
        self.assertEqual(gate.purchase_order_id, po.id)
        self.assertEqual(grn.gate_entry_id, gate.id)
        self.assertEqual(grn.lines.get().purchase_order_line.purchase_order_id, po.id)

        lot = InventoryLot.objects.get(company=company, lot_number=seed.LOT_DOC)
        self.assertEqual(lot.status, LotStatus.AVAILABLE)
        self.assertEqual(lot.bin.code, seed.BIN_RM)
        self.assertEqual(lot.landed_unit_cost, Decimal("1280.000000"))
        self.assertEqual(lot.purchase_unit_cost, Decimal("1000.000000"))

        inspections = QCInspection.objects.filter(company=company, lot=lot)
        self.assertEqual(inspections.count(), 1, "post_grn's inspection is reused, not duplicated")
        inspection = inspections.get()
        self.assertEqual(inspection.inspection_number, seed.QC_DOC)
        self.assertEqual(inspection.status, QCInspectionStatus.PASSED)
        self.assertEqual(inspection.grn_id, grn.id)
        self.assertTrue(inspection.coa_reference)

        bin_types = dict(Bin.objects.filter(warehouse=lot.warehouse).values_list("code", "bin_type"))
        self.assertEqual(bin_types[seed.BIN_RECV], BinType.RECEIVING)
        self.assertEqual(bin_types[seed.BIN_QC], BinType.QC_HOLD)
        self.assertEqual(bin_types[seed.BIN_RM], BinType.RAW_MATERIAL)

        putaway = PutawayOrder.objects.get(company=company, putaway_number=seed.PUT_DOC)
        self.assertEqual(putaway.status, OpsDocStatus.POSTED)
        self.assertEqual(putaway.lot_id, lot.id)

        bill = SupplierBill.objects.get(company=company, document_number=seed.BILL_DOC)
        self.assertEqual(bill.purchase_order_id, po.id)
        self.assertEqual(bill.grn_id, grn.id)

        so = SalesOrder.objects.get(company=company, document_number=seed.SO_DOC)
        dn = DispatchNote.objects.get(company=company, document_number=seed.DN_DOC)
        inv = SalesInvoice.objects.get(company=company, document_number=seed.INV_DOC)
        self.assertEqual(so.customer.code, seed.CUST_A)
        self.assertEqual(dn.sales_order_id, so.id)
        self.assertEqual(dn.status, DispatchNoteStatus.POSTED)
        self.assertEqual(inv.dispatch_note_id, dn.id)
        self.assertEqual(inv.status, SalesInvoiceStatus.POSTED)

        self.assertTrue(StockLedgerEntry.objects.filter(lot=lot, txn_type=StockTxnType.ISSUE).exists())
        balances = compute_balances(company=company, item=lot.item)
        self.assertEqual(Decimal(balances["available_to_consume"]), Decimal("75"))

        roles = set(UserRole.objects.filter(user__email__endswith="@ecowrap.com").values_list("role__code", flat=True))
        self.assertTrue({"administrator", "purchase", "warehouse", "quality_control", "sales"} <= roles)

    def test_rerun_adopts_legacy_po_number(self):
        seed.run(interactive=True)
        po = PurchaseOrder.objects.get(document_number=seed.PO_DOC)
        PurchaseOrder.objects.filter(pk=po.pk).update(document_number="PO-0000-000001")
        counts = _counts()

        seed.run(interactive=True)

        self.assertEqual(_counts(), counts)
        self.assertEqual(PurchaseOrder.objects.get(pk=po.pk).document_number, seed.PO_DOC)

    def test_rerun_refuses_split_chain(self):
        seed.run(interactive=True)
        GateEntry.objects.filter(gate_entry_number=seed.GATE_DOC).update(purchase_order=None)

        with self.assertRaisesMessage(CommandError, "not linked end to end"):
            seed.run(interactive=True)

    def test_interactive_chain_stops_before_outbound(self):
        result = seed.run(interactive=True)
        self.assertNotIn("sales_order", result)
        self.assertEqual(result["lot_status"], LotStatus.AVAILABLE)
        self.assertEqual(result["lot_bin"], seed.BIN_RM)
        self.assertEqual(result["lc_status"], LetterOfCreditStatus.DOCS_CLEARED)
        self.assertFalse(SalesOrder.objects.exists())
