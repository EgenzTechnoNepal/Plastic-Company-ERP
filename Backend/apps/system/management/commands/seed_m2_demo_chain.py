"""
python manage.py seed_m2_demo_chain

Deterministic typed Milestone 2 demo chain for Ecowrap Nepal:

  masters → PO → Gate → GRN (QC_HOLD) → QC PASS (AVAILABLE)
  → Landed cost → optional SO → reserve → dispatch → invoice

Safe to re-run (get_or_create / document-number guards). Refuses when DEBUG=False.

Also callable from seed_demo via seed_m2_demo_chain.run(...).
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Contact, Customer
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.models import (
    Item,
    ItemType,
    InventoryLot,
    LandedCostCategory,
    LandedCostDocument,
    LotStatus,
    UnitOfMeasure,
)
from apps.inventory.services import create_landed_component
from apps.organization.models import Company, Currency
from apps.procurement.bill_services import add_bill_line, create_supplier_bill, match_supplier_bill, post_supplier_bill
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    mark_po_sent,
    submit_purchase_order,
)
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.invoice_services import add_invoice_line, create_sales_invoice, post_sales_invoice
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse


# Deterministic demo codes (spec §8)
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
BIN_RM = "RM-01"
PO_DOC = "PO-M2-DEMO-001"
GATE_DOC = "GE-M2-DEMO-001"
GRN_DOC = "GRN-M2-DEMO-001"
QC_DOC = "QC-M2-DEMO-001"
LOT_DOC = "LOT-M2-PLA-001"
LCD_DOC = "LCD-M2-DEMO-001"
BILL_DOC = "BILL-M2-DEMO-001"
SO_DOC_PREFIX = "SO-M2"  # actual number from numbering service; we tag notes


def run(*, interactive: bool = True, user: User | None = None) -> dict:
    """
    Seed typed M2 chain. Returns ids/codes for verification.

    interactive=True  → stop after AVAILABLE + landed (+ bill matched); outbound left for live demo
    interactive=False → also SO → reserve → dispatch → invoice (regression / full reset)
    """
    company = Company.objects.filter(name__icontains="Ecowrap").first()
    if company is None:
        company = Company.objects.first()
    if company is None:
        raise CommandError("No company found. Run seed_demo first.")

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
        warehouse=warehouse, code=BIN_RECV, defaults={"bin_type": BinType.RECEIVING}
    )
    Bin.objects.get_or_create(
        warehouse=warehouse, code=BIN_RM, defaults={"bin_type": BinType.RAW_MATERIAL}
    )

    # --- Inbound commercial chain (idempotent on GRN number) ---
    grn = GoodsReceiptNote.objects.filter(company=company, grn_number=GRN_DOC).first()
    if grn is None:
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
        # Force stable document number for demo scripts when newly created
        if not PurchaseOrder_has_demo_tag(po):
            PurchaseOrder = po.__class__
            PurchaseOrder.objects.filter(pk=po.pk).update(document_number=PO_DOC, notes=po.notes or "M2 demo PO")
            po.refresh_from_db()

        line = add_po_line(
            purchase_order=po,
            item=pla,
            uom=kg,
            ordered_quantity=Decimal("100"),
            user=user,
            unit_price=Decimal("1000"),
            tax_pct=Decimal("0"),
            destination_warehouse=warehouse,
        )
        submit_purchase_order(purchase_order=po, user=user)
        approve_purchase_order(purchase_order=po, user=user)
        mark_po_sent(purchase_order=po, user=user)

        gate = GateEntry.objects.create(
            company=company,
            gate_entry_number=GATE_DOC,
            entry_at=timezone.now(),
            supplier=supplier_cn,
            purchase_order=po,
            vehicle_number="Ba 2 Kha 1234",
            driver_name="Ram Bahadur",
            status=GateEntryStatus.SUBMITTED,
            remarks="M2 demo gate",
        )
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
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=pla,
            uom=kg,
            received_quantity=Decimal("100"),
            accepted_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            lot_number=LOT_DOC,
            purchase_order_line=line,
        )
        post_grn(grn=grn, user=user)
    else:
        po = grn.gate_entry.purchase_order if grn.gate_entry_id else None
        line = grn.lines.first().purchase_order_line if grn.lines.exists() else None

    lot = InventoryLot.objects.filter(company=company, lot_number=LOT_DOC).first()
    if lot is None:
        raise CommandError(f"Expected lot {LOT_DOC} after GRN post.")

    inspection = QCInspection.objects.filter(company=company, inspection_number=QC_DOC).first()
    if inspection is None:
        inspection = QCInspection.objects.create(
            company=company,
            inspection_number=QC_DOC,
            grn=grn,
            lot=lot,
            item=pla,
            remarks="M2 demo incoming QC",
        )
    if lot.status == LotStatus.QC_HOLD:
        pass_inspection(inspection=inspection, user=user)
        lot.refresh_from_db()

    lcd = LandedCostDocument.objects.filter(company=company, document_number=LCD_DOC).first()
    if lcd is None:
        lcd = LandedCostDocument.objects.create(
            company=company,
            document_number=LCD_DOC,
            lot=lot,
            currency=npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
            notes="M2 demo landed cost",
        )
        # NPR 28,000 extras → landed 128,000 / 100 KG = 1,280
        create_landed_component(
            lcd,
            category=LandedCostCategory.INTERNATIONAL_FREIGHT,
            amount=Decimal("12000"),
            currency=npr,
            exchange_rate=Decimal("1"),
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.INSURANCE,
            amount=Decimal("3000"),
            currency=npr,
            exchange_rate=Decimal("1"),
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.CUSTOMS_DUTY,
            amount=Decimal("8000"),
            currency=npr,
            exchange_rate=Decimal("1"),
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.CLEARING,
            amount=Decimal("2000"),
            currency=npr,
            exchange_rate=Decimal("1"),
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.NEPAL_TRANSPORT,
            amount=Decimal("3000"),
            currency=npr,
            exchange_rate=Decimal("1"),
        )
        post_landed_cost(document=lcd, user=user)

    # Supplier bill + server match (optional demo credibility)
    from apps.procurement.commercial import SupplierBill

    bill = SupplierBill.objects.filter(company=company, document_number=BILL_DOC).first()
    if bill is None and po is not None and line is not None:
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
        SupplierBill.objects.filter(pk=bill.pk).update(document_number=BILL_DOC)
        bill.refresh_from_db()
        add_bill_line(
            bill=bill,
            item=pla,
            uom=kg,
            quantity=Decimal("100"),
            unit_price=Decimal("1000"),
            user=user,
            purchase_order_line=line,
            grn_line=grn.lines.first(),
        )
        match_supplier_bill(bill=bill, user=user)
        post_supplier_bill(bill=bill, user=user)

    result = {
        "company_id": str(company.id),
        "supplier": SUP_CN,
        "customer": CUST_A,
        "item": SKU_PLA,
        "warehouse": WH_CODE,
        "po": PO_DOC,
        "gate": GATE_DOC,
        "grn": GRN_DOC,
        "lot": LOT_DOC,
        "lot_status": lot.status,
        "qc": QC_DOC,
        "landed": LCD_DOC,
        "bill": BILL_DOC if bill else None,
        "interactive": interactive,
    }

    if interactive:
        return result

    # Full outbound for regression / non-interactive reset
    from apps.sales.commercial import SalesOrder

    existing_so = SalesOrder.objects.filter(company=company, notes__contains="M2 demo SO").first()
    if existing_so is None:
        so = create_sales_order(
            company=company,
            customer=cust_a,
            user=user,
            warehouse=warehouse,
            currency=npr,
            notes="M2 demo SO — sell 25 KG PLA",
        )
        so_line = add_so_line(
            sales_order=so,
            item=pla,
            uom=kg,
            ordered_quantity=Decimal("25"),
            user=user,
            warehouse=warehouse,
            unit_price=Decimal("1800"),
        )
        confirm_sales_order(sales_order=so, user=user)
        dn = create_dispatch_note(sales_order=so, user=user, warehouse=warehouse, notes="M2 demo dispatch")
        add_dispatch_line(dispatch=dn, sales_order_line=so_line, quantity=Decimal("25"), user=user)
        post_dispatch(dispatch=dn, user=user)
        inv = create_sales_invoice(
            company=company,
            customer=cust_a,
            user=user,
            sales_order=so,
            dispatch_note=dn,
            currency=npr,
            notes="M2 demo invoice",
        )
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
        result.update(
            {
                "sales_order": so.document_number,
                "dispatch": dn.document_number,
                "invoice": inv.document_number,
            }
        )
    else:
        result["sales_order"] = existing_so.document_number

    return result


def PurchaseOrder_has_demo_tag(po) -> bool:
    return po.document_number == PO_DOC or (po.notes or "").startswith("M2 demo")


class Command(BaseCommand):
    help = "Seed typed Milestone 2 demo chain (PO→QC→Landed; optional full outbound)."

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
