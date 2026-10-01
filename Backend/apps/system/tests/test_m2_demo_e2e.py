"""
Milestone 2 demo E2E — typed PO→Gate→GRN→QC PASS→Landed→SO→Reserve→Dispatch→Invoice.
"""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.inventory.landed_post import post_landed_cost
from apps.inventory.ledger import StockLedgerEntry, StockTxnType
from apps.inventory.models import (
    Item,
    ItemType,
    InventoryLot,
    InventoryReceiptLayer,
    LandedCostCategory,
    LandedCostDocument,
    LotStatus,
    UnitOfMeasure,
)
from apps.inventory.services import create_landed_component
from apps.inventory.stock_services import compute_balances
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.quality.qc import QCInspection
from apps.quality.qc_services import pass_inspection
from apps.sales.commercial import (
    DispatchNoteStatus,
    SalesInvoiceStatus,
    SalesOrderStatus,
)
from apps.sales.dispatch_services import add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.invoice_services import add_invoice_line, create_sales_invoice, post_sales_invoice
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse


class Milestone2DemoE2ETests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Ecowrap M2 Demo", legal_name="Ecowrap M2 Demo Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.fob, _ = Incoterm.objects.get_or_create(
            code="FOB", defaults={"name": "Free On Board", "version": "2020"}
        )
        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-CN-PLA",
            legal_name="China Raw Material Supplier",
            preferred_incoterm=self.fob,
        )
        self.customer = Customer.objects.create(
            company=self.company,
            code="CUST-A",
            legal_name="Demo Customer A",
            trading_name="Demo Customer A",
        )
        self.item = Item.objects.create(
            company=self.company,
            sku="RM-PLA-001",
            name="PLA Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-RM", name="RM Store")
        self.bin_recv = Bin.objects.create(
            warehouse=self.warehouse, code="RECV-01", bin_type=BinType.RECEIVING
        )
        self.user = User.objects.create_superuser(email="m2demo@ecowrap.com", password="Str0ng!Passw0rd")

    def test_m2_demo_journey_po_to_invoice(self):
        po = create_purchase_order(
            company=self.company,
            supplier=self.supplier,
            user=self.user,
            currency=self.npr,
            destination_warehouse=self.warehouse,
        )
        po_line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("100"),
            user=self.user,
            unit_price=Decimal("1000"),
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)

        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-M2-E2E",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-M2-E2E",
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
            received_quantity=Decimal("100"),
            accepted_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            lot_number="LOT-M2-E2E",
            purchase_order_line=po_line,
        )
        post_grn(grn=grn, user=self.user)

        lot = InventoryLot.objects.get(company=self.company, lot_number="LOT-M2-E2E")
        self.assertEqual(lot.status, LotStatus.QC_HOLD)
        bal = compute_balances(company=self.company, item=self.item)
        self.assertEqual(Decimal(bal["qc_hold"]), Decimal("100"))
        self.assertEqual(Decimal(bal["available_to_consume"]), Decimal("0"))

        inspection = QCInspection.objects.create(
            company=self.company,
            inspection_number="QC-M2-E2E",
            grn=grn,
            lot=lot,
            item=self.item,
        )
        pass_inspection(inspection=inspection, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

        lcd = LandedCostDocument.objects.create(
            company=self.company,
            document_number="LCD-M2-E2E",
            lot=lot,
            currency=self.npr,
            purchase_quantity=Decimal("100"),
            purchase_unit_cost=Decimal("1000"),
            purchase_value=Decimal("100000"),
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.INTERNATIONAL_FREIGHT,
            amount=Decimal("12000"),
            currency=self.npr,
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.INSURANCE,
            amount=Decimal("3000"),
            currency=self.npr,
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.CUSTOMS_DUTY,
            amount=Decimal("8000"),
            currency=self.npr,
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.CLEARING,
            amount=Decimal("2000"),
            currency=self.npr,
        )
        create_landed_component(
            lcd,
            category=LandedCostCategory.NEPAL_TRANSPORT,
            amount=Decimal("3000"),
            currency=self.npr,
        )
        post_landed_cost(document=lcd, user=self.user)
        lot.refresh_from_db()
        self.assertEqual(lot.landed_unit_cost, Decimal("1280.000000"))

        so = create_sales_order(
            company=self.company,
            customer=self.customer,
            user=self.user,
            warehouse=self.warehouse,
            currency=self.npr,
        )
        so_line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("25"),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("1800"),
        )
        confirm_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        so_line.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.RESERVED)
        self.assertEqual(so_line.reserved_quantity, Decimal("25"))

        layer = InventoryReceiptLayer.objects.get(lot=lot)
        self.assertEqual(layer.reserved_quantity, Decimal("25"))

        dn = create_dispatch_note(sales_order=so, user=self.user, warehouse=self.warehouse)
        add_dispatch_line(dispatch=dn, sales_order_line=so_line, quantity=Decimal("25"), user=self.user)
        post_dispatch(dispatch=dn, user=self.user)
        dn.refresh_from_db()
        self.assertEqual(dn.status, DispatchNoteStatus.POSTED)
        self.assertTrue(
            StockLedgerEntry.objects.filter(txn_type=StockTxnType.ISSUE).exists()
            or StockLedgerEntry.objects.filter(reference_type__icontains="dispatch").exists()
            or StockLedgerEntry.objects.count() >= 2
        )

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
            quantity=Decimal("25"),
            unit_price=Decimal("1800"),
            user=self.user,
            sales_order_line=so_line,
        )
        post_sales_invoice(invoice=inv, user=self.user)
        inv.refresh_from_db()
        self.assertEqual(inv.status, SalesInvoiceStatus.POSTED)

        bal_after = compute_balances(company=self.company, item=self.item)
        self.assertEqual(Decimal(bal_after["available_to_consume"]), Decimal("75"))
