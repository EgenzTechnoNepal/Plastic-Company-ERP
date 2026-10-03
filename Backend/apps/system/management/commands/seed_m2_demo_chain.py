"""
python manage.py seed_m2_demo_chain [--full]

Deterministic typed Milestone 2 demo chain for Ecowrap Nepal:

  company/users/roles → masters → PO → PI → LC (DOCS_CLEARED) → Gate → GRN (QC_HOLD bin)
  → QC PASS (AVAILABLE) → Landed cost → Putaway to RM-01 → Supplier bill
  --full adds: SO → reserve → dispatch → invoice

Every step runs through the domain services (no direct status writes), so the LC gate,
QC gate, ledger and reservation rules apply exactly as they do in the UI.

Safe to re-run: each step is guarded by a fixed document number and skipped when present.
Refuses when DEBUG=False. Also callable from seed_demo via run(...).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User, UserRole
from apps.crm.models import Contact, Customer
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.models import (
    InventoryLot,
    Item,
    ItemType,
    LandedCostCategory,
    LandedCostDocument,
    LotStatus,
    UnitOfMeasure,
)
from apps.inventory.services import create_landed_component
from apps.organization.models import Currency
from apps.procurement.bill_services import add_bill_line, create_supplier_bill, match_supplier_bill, post_supplier_bill
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn, submit_gate_entry
from apps.procurement.lc_services import (
    attach_draft_lc_scan,
    create_letter_of_credit,
    create_proforma_invoice,
    issue_final_lc,
    mark_manufacturing,
    record_seller_draft_ok,
    run_draft_lc_match,
    verify_pre_dispatch_packet,
)
from apps.procurement.models import Incoterm, PurchaseOrder, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    mark_po_sent,
    submit_purchase_order,
)
from apps.procurement.trade_finance import (
    LetterOfCredit,
    LetterOfCreditStatus,
    ProformaInvoice,
    ProformaInvoiceStatus,
)
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.quality.qc_services import pass_inspection
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.invoice_services import add_invoice_line, create_sales_invoice, post_sales_invoice
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse
from apps.warehouse.operations import OpsDocStatus, PutawayOrder
from apps.warehouse.ops_services import post_putaway


# Deterministic demo codes (spec §8) — referenced by the client demo runbook.
SUP_CN = "SUP-CN-PLA"
SUP_NP = "SUP-NP-PKG"
CUST_A = "CUST-A"
CUST_B = "CUST-B"
SKU_PLA = "RM-PLA-001"
SKU_RPL = "RM-RPL-001"
SKU_MB = "RM-MB-001"
SKU_PKG = "PKG-001"
SKU_FG_A = "FG-A-001"
SKU_FG_B = "FG-B-001"
WH_CODE = "WH-RM"
BIN_RECV = "RECV-01"
BIN_QC = "QC-HOLD"
BIN_RM = "RM-01"
PO_DOC = "PO-M2-DEMO-001"
PI_DOC = "PI-M2-DEMO-001"
LC_DOC = "LC-M2-DEMO-001"
GATE_DOC = "GE-M2-DEMO-001"
GRN_DOC = "GRN-M2-DEMO-001"
QC_DOC = "QC-M2-DEMO-001"
LOT_DOC = "LOT-M2-PLA-001"
LCD_DOC = "LCD-M2-DEMO-001"
PUT_DOC = "PUT-M2-DEMO-001"
BILL_DOC = "BILL-M2-DEMO-001"
SO_DOC = "SO-M2-DEMO-001"
DN_DOC = "DN-M2-DEMO-001"
INV_DOC = "INV-M2-DEMO-001"

# Live-demo POs: nothing received yet, so the presenter walks Gate → GRN → QC → Landed in the UI.
LIVE_PO_DOC = "PO-M2-DEMO-002"
LIVE_PI_DOC = "PI-M2-DEMO-002"
LIVE_LC_DOC = "LC-M2-DEMO-002"
BLOCKED_PO_DOC = "PO-M2-DEMO-003"
BLOCKED_PI_DOC = "PI-M2-DEMO-003"
BLOCKED_LC_DOC = "LC-M2-DEMO-003"

PLA_QTY = Decimal("100")
PLA_PRICE = Decimal("1000")
LC_REQUIRED_DOCS = ["commercial_invoice", "packing_list", "bill_of_lading", "coa"]


def _rename(obj, field: str, value: str) -> None:
    """Pin a service-generated document number to the deterministic demo code."""
    type(obj).objects.filter(pk=obj.pk).update(**{field: value})
    obj.refresh_from_db()


def _ensure_company_and_users():
    """Organization, RBAC catalogue and demo users (idempotent; shared with seed_demo)."""
    from apps.system.management.commands.seed_demo import Command as SeedDemo

    helper = SeedDemo()
    company = helper._seed_organization()
    role_map = helper._seed_rbac()
    helper._seed_users(role_map)
    return company


def _ensure_trade_finance(
    *,
    company,
    po,
    user,
    pi_doc: str = PI_DOC,
    lc_doc: str = LC_DOC,
    seller_pi_number: str = "CN-PI-2026-0418",
    final_lc_number: str = "DCB-LC-DEMO-0001",
    stop_at: str = LetterOfCreditStatus.DOCS_CLEARED,
) -> tuple[ProformaInvoice, LetterOfCredit]:
    """PI + LC for a demo PO, walked through the LC steps until `stop_at` (default DOCS_CLEARED)."""
    pi = ProformaInvoice.objects.filter(company=company, document_number=pi_doc).first()
    if pi is None:
        pi = create_proforma_invoice(
            company=company,
            purchase_order=po,
            user=user,
            status=ProformaInvoiceStatus.ACCEPTED,
            seller_pi_number=seller_pi_number,
            currency_code="NPR",
            total_amount=PLA_QTY * PLA_PRICE,
            payment_terms="LC at sight",
            lead_time_days=30,
            notes="M2 demo proforma — PLA 100 KG",
        )
        _rename(pi, "document_number", pi_doc)

    lc = LetterOfCredit.objects.filter(company=company, document_number=lc_doc).first()
    if lc is None:
        today = timezone.now().date()
        lc = create_letter_of_credit(
            company=company,
            purchase_order=po,
            proforma_invoice=pi,
            user=user,
            bank_name="Demo Commercial Bank Ltd.",
            currency_code="NPR",
            amount=pi.total_amount,
            latest_shipment_date=today + timedelta(days=30),
            expiry_date=today + timedelta(days=60),
            notes="M2 demo LC",
        )
        _rename(lc, "document_number", lc_doc)

    for _ in range(10):
        lc.refresh_from_db()
        status = lc.status
        if status == stop_at or status == LetterOfCreditStatus.DOCS_CLEARED:
            break
        if status == LetterOfCreditStatus.DRAFT:
            attach_draft_lc_scan(
                lc,
                extracted={
                    "amount": str(pi.total_amount),
                    "currency": "NPR",
                    "beneficiary": po.supplier.legal_name,
                },
                user=user,
            )
        elif status in {LetterOfCreditStatus.DRAFT_LC_SCANNED, LetterOfCreditStatus.AI_MATCH_FAILED}:
            run_draft_lc_match(lc, user=user)
            lc.refresh_from_db()
            if lc.status != LetterOfCreditStatus.AI_MATCH_PASSED:
                raise CommandError(f"Demo LC match failed: {lc.match_result}")
        elif status == LetterOfCreditStatus.AI_MATCH_PASSED:
            record_seller_draft_ok(lc, note="Seller confirmed draft LC terms.", user=user)
        elif status == LetterOfCreditStatus.SELLER_APPROVED:
            issue_final_lc(lc, final_lc_number=final_lc_number, user=user)
        elif status == LetterOfCreditStatus.FINAL_ISSUED:
            mark_manufacturing(lc, user=user)
        elif status in {
            LetterOfCreditStatus.MANUFACTURING,
            LetterOfCreditStatus.DOCS_PENDING,
            LetterOfCreditStatus.DOCS_BLOCKED,
        }:
            verify_pre_dispatch_packet(lc, present_keys=LC_REQUIRED_DOCS, user=user)
        else:
            raise CommandError(f"Demo LC is {status}; cannot reach DOCS_CLEARED.")
    lc.refresh_from_db()
    if lc.status not in {stop_at, LetterOfCreditStatus.DOCS_CLEARED}:
        raise CommandError(f"Demo LC stuck at {lc.status}.")
    return pi, lc


def _ensure_open_po(*, company, document_number, supplier, item, uom, warehouse, incoterm, currency, user, notes):
    """Approved + sent PO with one line and nothing received — the starting point of a live inbound demo."""
    po = PurchaseOrder.objects.filter(company=company, document_number=document_number).first()
    if po is not None:
        return po
    po = create_purchase_order(
        company=company,
        supplier=supplier,
        user=user,
        currency=currency,
        destination_warehouse=warehouse,
        incoterm=incoterm,
        named_place="Shanghai",
        payment_terms="LC 30 Days",
        notes=notes,
    )
    _rename(po, "document_number", document_number)
    add_po_line(
        purchase_order=po,
        item=item,
        uom=uom,
        ordered_quantity=PLA_QTY,
        user=user,
        unit_price=PLA_PRICE,
        tax_pct=Decimal("0"),
        destination_warehouse=warehouse,
    )
    submit_purchase_order(purchase_order=po, user=user)
    approve_purchase_order(purchase_order=po, user=user)
    mark_po_sent(purchase_order=po, user=user)
    po.refresh_from_db()
    return po


def _assert_inbound_linked(*, po, pi, lc, grn, lot, inspection, lcd, putaway, bill) -> None:
    """Existing demo documents are reused by number, so verify they still form one chain."""
    gate = grn.gate_entry
    grn_po_ids = {
        line.purchase_order_line.purchase_order_id
        for line in grn.lines.select_related("purchase_order_line")
        if line.purchase_order_line_id
    }
    checks = {
        f"{PI_DOC} -> {PO_DOC}": pi.purchase_order_id == po.id,
        f"{LC_DOC} -> {PO_DOC}": lc.purchase_order_id == po.id,
        f"{LC_DOC} -> {PI_DOC}": lc.proforma_invoice_id == pi.id,
        f"{GATE_DOC} -> {PO_DOC}": gate is not None and gate.purchase_order_id == po.id,
        f"{GRN_DOC} lines -> {PO_DOC}": grn_po_ids == {po.id},
        f"{QC_DOC} -> {LOT_DOC}": inspection.lot_id == lot.id,
        f"{LCD_DOC} -> {LOT_DOC}": lcd.lot_id == lot.id,
        f"{PUT_DOC} -> {LOT_DOC}": putaway is None or putaway.lot_id == lot.id,
        f"{BILL_DOC} -> {PO_DOC}/{GRN_DOC}": bill is None or (bill.purchase_order_id == po.id and bill.grn_id == grn.id),
    }
    broken = [name for name, ok in checks.items() if not ok]
    if broken:
        raise CommandError(
            "Demo chain in this database is not linked end to end (left over from an older seed run): "
            + ", ".join(broken)
            + ". Reset the local demo database, then re-run seed_demo and seed_m2_demo_chain."
        )


def run(*, interactive: bool = True, user: User | None = None) -> dict:
    """
    Seed typed M2 chain. Returns ids/codes for verification.

    interactive=True  → stop after AVAILABLE + landed + putaway (+ bill matched); outbound left for live demo
    interactive=False → also SO → reserve → dispatch → invoice (regression / full reset)
    """
    company = _ensure_company_and_users()

    if user is None:
        user = User.objects.filter(email="admin@ecowrap.com").first() or User.objects.filter(is_superuser=True).first()

    npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "Nepalese Rupee", "symbol": "Rs"})
    kg, _ = UnitOfMeasure.objects.get_or_create(
        code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
    )
    pcs, _ = UnitOfMeasure.objects.get_or_create(code="PCS", defaults={"name": "Pieces"})
    fob, _ = Incoterm.objects.get_or_create(
        code="FOB", defaults={"name": "Free On Board", "version": "2020"}
    )

    supplier_cn, _ = Supplier.objects.get_or_create(
        company=company,
        code=SUP_CN,
        defaults={
            "legal_name": "China Raw Material Supplier Co. Ltd.",
            "trading_name": "China Raw Material Supplier",
            "country": "China",
            "preferred_incoterm": fob,
            "payment_terms": "LC 30 Days",
            "email": "export@china-rm.example",
            "phone": "+86-10000000001",
        },
    )
    Supplier.objects.get_or_create(
        company=company,
        code=SUP_NP,
        defaults={
            "legal_name": "Nepal Packaging Supplier Pvt. Ltd.",
            "trading_name": "Nepal Packaging Supplier",
            "country": "Nepal",
            "preferred_incoterm": fob,
            "payment_terms": "Net 15",
            "email": "sales@nepal-pkg.example",
            "phone": "+977-9800111222",
        },
    )

    cust_a, _ = Customer.objects.get_or_create(
        company=company,
        code=CUST_A,
        defaults={
            "legal_name": "Demo Customer A Pvt. Ltd.",
            "trading_name": "Demo Customer A",
            "customer_type": "CORPORATE",
            "country": "Nepal",
            "address": "Kathmandu",
            "email": "orders@customer-a.example",
            "phone": "+977-9800222333",
            "payment_terms": "30 Days",
            "credit_limit": Decimal("2000000"),
            "currency": npr,
        },
    )
    Customer.objects.get_or_create(
        company=company,
        code=CUST_B,
        defaults={
            "legal_name": "Demo Customer B Traders",
            "trading_name": "Demo Customer B",
            "customer_type": "RETAIL",
            "country": "Nepal",
            "address": "Itahari",
            "email": "buy@customer-b.example",
            "phone": "+977-9800333444",
            "payment_terms": "Cash",
            "credit_limit": Decimal("500000"),
            "currency": npr,
        },
    )
    Contact.objects.get_or_create(
        company=company,
        customer=cust_a,
        name="Anita Sharma",
        defaults={
            "designation": "Procurement Lead",
            "email": "anita@customer-a.example",
            "phone": "+977-9800222334",
            "is_primary": True,
            "preferred_channel": "email",
        },
    )
    Contact.objects.get_or_create(
        company=company,
        supplier=supplier_cn,
        name="Li Wei",
        defaults={
            "designation": "Export Manager",
            "email": "li.wei@china-rm.example",
            "phone": "+86-10000000002",
            "party_kind": "SUPPLIER",
            "is_primary": True,
            "preferred_channel": "email",
        },
    )

    def _item(sku, name, item_type, uom, qc=False):
        obj, _ = Item.objects.get_or_create(
            company=company,
            sku=sku,
            defaults={
                "name": name,
                "item_type": item_type,
                "base_uom": uom,
                "purchase_uom": uom,
                "stock_uom": uom,
                "qc_required": qc,
                "fifo_eligible": True,
                "preferred_supplier": supplier_cn if item_type == ItemType.RAW_MATERIAL else None,
            },
        )
        return obj

    pla = _item(SKU_PLA, "PLA Raw Material", ItemType.RAW_MATERIAL, kg, qc=True)
    _item(SKU_RPL, "Recycled Plastic Raw Material", ItemType.RAW_MATERIAL, kg, qc=True)
    _item(SKU_MB, "Masterbatch", ItemType.RAW_MATERIAL, kg, qc=True)
    _item(SKU_PKG, "Packaging Material", ItemType.PACKAGING, pcs, qc=False)
    _item(SKU_FG_A, "Finished Product A", ItemType.FINISHED_GOOD, pcs, qc=True)
    _item(SKU_FG_B, "Finished Product B", ItemType.FINISHED_GOOD, pcs, qc=True)

    warehouse, _ = Warehouse.objects.get_or_create(
        company=company, code=WH_CODE, defaults={"name": "Raw Material Store"}
    )
    bin_recv, _ = Bin.objects.get_or_create(
        warehouse=warehouse, code=BIN_RECV, defaults={"bin_type": BinType.RECEIVING, "name": "Receiving Dock"}
    )
    Bin.objects.get_or_create(
        warehouse=warehouse, code=BIN_QC, defaults={"bin_type": BinType.QC_HOLD, "name": "QC Hold"}
    )
    bin_rm, _ = Bin.objects.get_or_create(
        warehouse=warehouse, code=BIN_RM, defaults={"bin_type": BinType.RAW_MATERIAL, "name": "Raw Material Rack 01"}
    )

    # --- Purchase order ---
    po = PurchaseOrder.objects.filter(company=company, document_number=PO_DOC).first()
    if po is None:
        # Older seed versions left the PO on its service-generated number; adopt it via the demo gate.
        legacy_gate = (
            GateEntry.objects.filter(company=company, gate_entry_number=GATE_DOC)
            .exclude(purchase_order=None)
            .first()
        )
        if legacy_gate is not None:
            po = legacy_gate.purchase_order
            _rename(po, "document_number", PO_DOC)
    if po is None:
        po = create_purchase_order(
            company=company,
            supplier=supplier_cn,
            user=user,
            currency=npr,
            destination_warehouse=warehouse,
            incoterm=fob,
            named_place="Shanghai",
            payment_terms="LC 30 Days",
            notes="M2 demo PO — PLA 100 KG",
        )
        _rename(po, "document_number", PO_DOC)
        add_po_line(
            purchase_order=po,
            item=pla,
            uom=kg,
            ordered_quantity=PLA_QTY,
            user=user,
            unit_price=PLA_PRICE,
            tax_pct=Decimal("0"),
            destination_warehouse=warehouse,
        )
        submit_purchase_order(purchase_order=po, user=user)
        approve_purchase_order(purchase_order=po, user=user)
        mark_po_sent(purchase_order=po, user=user)
    line = po.lines.filter(item=pla).first()

    # --- PI / LC: must be DOCS_CLEARED before the LC gate lets the truck in ---
    pi, lc = _ensure_trade_finance(company=company, po=po, user=user)

    # --- Gate → GRN (lot lands in QC_HOLD bin, draft inspection auto-created) ---
    grn = GoodsReceiptNote.objects.filter(company=company, grn_number=GRN_DOC).first()
    if grn is None:
        gate = GateEntry.objects.filter(company=company, gate_entry_number=GATE_DOC).first()
        if gate is None:
            gate = GateEntry.objects.create(
                company=company,
                gate_entry_number=GATE_DOC,
                entry_at=timezone.now(),
                supplier=supplier_cn,
                purchase_order=po,
                vehicle_number="Ko 1 Ja 2468",
                driver_name="Ram Bahadur",
                remarks="M2 demo gate",
                created_by=user,
                updated_by=user,
            )
        if gate.status == GateEntryStatus.DRAFT:
            gate = submit_gate_entry(gate=gate, user=user)
        grn = GoodsReceiptNote.objects.create(
            company=company,
            grn_number=GRN_DOC,
            gate_entry=gate,
            supplier=supplier_cn,
            warehouse=warehouse,
            receiving_bin=bin_recv,
            received_at=timezone.now(),
            currency=npr,
            notes="M2 demo GRN",
            created_by=user,
            updated_by=user,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=pla,
            uom=kg,
            received_quantity=PLA_QTY,
            accepted_quantity=PLA_QTY,
            purchase_unit_cost=PLA_PRICE,
            lot_number=LOT_DOC,
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=user)

    lot = InventoryLot.objects.filter(company=company, lot_number=LOT_DOC).first()
    if lot is None:
        raise CommandError(f"Expected lot {LOT_DOC} after GRN post.")

    # --- QC: reuse the inspection post_grn opened, pin its number, attach CoA ---
    inspection = QCInspection.objects.filter(company=company, inspection_number=QC_DOC).first()
    if inspection is None:
        inspection = (
            QCInspection.objects.filter(company=company, lot=lot, status=QCInspectionStatus.DRAFT)
            .order_by("created_at")
            .first()
        )
        if inspection is None:
            inspection = QCInspection.objects.create(
                company=company, inspection_number=QC_DOC, grn=grn, lot=lot, item=pla
            )
        QCInspection.objects.filter(pk=inspection.pk).update(
            inspection_number=QC_DOC,
            remarks="M2 demo incoming QC — visual, MFI and moisture within spec",
            coa_reference=inspection.coa_reference or "COA-CN-PLA-0418",
        )
        inspection.refresh_from_db()
    if lot.status == LotStatus.QC_HOLD and inspection.status == QCInspectionStatus.DRAFT:
        pass_inspection(inspection=inspection, user=user)
        lot.refresh_from_db()

    # --- Landed cost: NPR 100,000 + 28,000 extras → 128,000 / 100 KG = NPR 1,280/KG ---
    lcd = LandedCostDocument.objects.filter(company=company, document_number=LCD_DOC).first()
    if lcd is None:
        lcd = LandedCostDocument.objects.create(
            company=company,
            document_number=LCD_DOC,
            lot=lot,
            currency=npr,
            purchase_quantity=PLA_QTY,
            purchase_unit_cost=PLA_PRICE,
            purchase_value=PLA_QTY * PLA_PRICE,
            notes="M2 demo landed cost",
        )
        for category, amount in (
            (LandedCostCategory.INTERNATIONAL_FREIGHT, "12000"),
            (LandedCostCategory.INSURANCE, "3000"),
            (LandedCostCategory.CUSTOMS_DUTY, "8000"),
            (LandedCostCategory.CLEARING, "2000"),
            (LandedCostCategory.NEPAL_TRANSPORT, "3000"),
        ):
            create_landed_component(
                lcd, category=category, amount=Decimal(amount), currency=npr, exchange_rate=Decimal("1")
            )
        post_landed_cost(document=lcd, user=user)
        lot.refresh_from_db()

    # --- Putaway: QC-released stock moves from the QC hold bin to the raw-material rack ---
    putaway = PutawayOrder.objects.filter(company=company, putaway_number=PUT_DOC).first()
    if putaway is None and lot.status == LotStatus.AVAILABLE and lot.bin_id != bin_rm.id:
        putaway = PutawayOrder.objects.create(
            company=company,
            putaway_number=PUT_DOC,
            lot=lot,
            from_bin=lot.bin,
            to_warehouse=warehouse,
            to_bin=bin_rm,
            quantity=lot.remaining_quantity,
            notes="M2 demo putaway after QC pass",
            created_by=user,
            updated_by=user,
        )
    if putaway is not None and putaway.status == OpsDocStatus.DRAFT:
        post_putaway(putaway=putaway, user=user)
        lot.refresh_from_db()

    # --- Supplier bill + server-side 3-way match ---
    from apps.procurement.commercial import SupplierBill

    bill = SupplierBill.objects.filter(company=company, document_number=BILL_DOC).first()
    if bill is None and line is not None:
        bill = create_supplier_bill(
            company=company,
            supplier=supplier_cn,
            user=user,
            purchase_order=po,
            grn=grn,
            currency=npr,
            supplier_invoice_number="CN-INV-M2-001",
            notes="M2 demo supplier bill",
        )
        _rename(bill, "document_number", BILL_DOC)
        add_bill_line(
            bill=bill,
            item=pla,
            uom=kg,
            quantity=PLA_QTY,
            unit_price=PLA_PRICE,
            user=user,
            purchase_order_line=line,
            grn_line=grn.lines.first(),
        )
        match_supplier_bill(bill=bill, user=user)
        post_supplier_bill(bill=bill, user=user)

    _assert_inbound_linked(
        po=po, pi=pi, lc=lc, grn=grn, lot=lot, inspection=inspection, lcd=lcd, putaway=putaway, bill=bill
    )

    open_po_args = dict(
        company=company, supplier=supplier_cn, item=pla, uom=kg, warehouse=warehouse,
        incoterm=fob, currency=npr, user=user,
    )
    live_po = _ensure_open_po(document_number=LIVE_PO_DOC, notes="Live demo PO — PLA 100 KG", **open_po_args)
    _, live_lc = _ensure_trade_finance(
        company=company, po=live_po, user=user, pi_doc=LIVE_PI_DOC, lc_doc=LIVE_LC_DOC,
        seller_pi_number="CN-PI-2026-0502", final_lc_number="DCB-LC-DEMO-0002",
    )
    blocked_po = _ensure_open_po(
        document_number=BLOCKED_PO_DOC, notes="LC gate demo PO — documents not yet cleared", **open_po_args
    )
    _, blocked_lc = _ensure_trade_finance(
        company=company, po=blocked_po, user=user, pi_doc=BLOCKED_PI_DOC, lc_doc=BLOCKED_LC_DOC,
        seller_pi_number="CN-PI-2026-0519", final_lc_number="DCB-LC-DEMO-0003",
        stop_at=LetterOfCreditStatus.MANUFACTURING,
    )

    result = {
        "company_id": str(company.id),
        "users": sorted(
            f"{ur.user.email}:{ur.role.code}"
            for ur in UserRole.objects.select_related("user", "role").filter(user__email__endswith="@ecowrap.com")
        ),
        "supplier": SUP_CN,
        "customer": CUST_A,
        "item": SKU_PLA,
        "warehouse": WH_CODE,
        "bins": [BIN_RECV, BIN_QC, BIN_RM],
        "po": po.document_number,
        "pi": pi.document_number,
        "lc": lc.document_number,
        "lc_status": lc.status,
        "gate": GATE_DOC,
        "grn": GRN_DOC,
        "qc": QC_DOC,
        "lot": LOT_DOC,
        "lot_status": lot.status,
        "lot_bin": lot.bin.code if lot.bin_id else None,
        "landed": LCD_DOC,
        "landed_unit_cost": str(lot.landed_unit_cost),
        "putaway": PUT_DOC if putaway else None,
        "bill": BILL_DOC if bill else None,
        "live_po": f"{live_po.document_number} ({live_po.status}, LC {live_lc.status})",
        "lc_blocked_po": f"{blocked_po.document_number} ({blocked_po.status}, LC {blocked_lc.status})",
        "interactive": interactive,
    }

    if interactive:
        return result

    # --- Full outbound for regression / non-interactive reset ---
    from apps.sales.commercial import DispatchNote, SalesInvoice, SalesOrder

    so = SalesOrder.objects.filter(company=company, document_number=SO_DOC).first()
    if so is None:
        so = create_sales_order(
            company=company,
            customer=cust_a,
            user=user,
            warehouse=warehouse,
            currency=npr,
            notes="M2 demo SO — sell 25 KG PLA",
        )
        _rename(so, "document_number", SO_DOC)
        add_so_line(
            sales_order=so,
            item=pla,
            uom=kg,
            ordered_quantity=Decimal("25"),
            user=user,
            warehouse=warehouse,
            unit_price=Decimal("1800"),
        )
        confirm_sales_order(sales_order=so, user=user)
    so_line = so.lines.filter(item=pla).first()

    dn = DispatchNote.objects.filter(company=company, document_number=DN_DOC).first()
    if dn is None:
        dn = create_dispatch_note(sales_order=so, user=user, warehouse=warehouse, notes="M2 demo dispatch")
        _rename(dn, "document_number", DN_DOC)
        add_dispatch_line(dispatch=dn, sales_order_line=so_line, quantity=Decimal("25"), user=user)
        post_dispatch(dispatch=dn, user=user)

    inv = SalesInvoice.objects.filter(company=company, document_number=INV_DOC).first()
    if inv is None:
        inv = create_sales_invoice(
            company=company,
            customer=cust_a,
            user=user,
            sales_order=so,
            dispatch_note=dn,
            currency=npr,
            notes="M2 demo invoice",
        )
        _rename(inv, "document_number", INV_DOC)
        add_invoice_line(
            invoice=inv,
            item=pla,
            uom=kg,
            quantity=Decimal("25"),
            unit_price=Decimal("1800"),
            user=user,
            sales_order_line=so_line,
        )
        post_sales_invoice(invoice=inv, user=user)

    result.update({"sales_order": SO_DOC, "dispatch": DN_DOC, "invoice": INV_DOC})
    return result


class Command(BaseCommand):
    help = "Seed typed Milestone 2 demo chain (PO→PI/LC→Gate→GRN→QC→Landed→Putaway; --full adds outbound)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--full",
            action="store_true",
            help="Also seed SO→reserve→dispatch→invoice (non-interactive / regression).",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_m2_demo_chain refuses to run when DEBUG=False.")

        with transaction.atomic():
            result = run(interactive=not options["full"])

        self.stdout.write(self.style.SUCCESS("M2 demo chain seeded:"))
        for k, v in result.items():
            self.stdout.write(f"  {k}: {v}")
