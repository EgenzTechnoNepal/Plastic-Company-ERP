from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Customer
from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.inventory.ledger import ReservationStatus
from apps.inventory.models import Item, ItemType, InventoryLot, LotStatus, UnitOfMeasure
from apps.inventory.services import transition_lot_status
from apps.inventory.stock_services import ReservationError, compute_balances, reserve_stock
from apps.organization.models import Company, Currency
from apps.procurement.inbound import GateEntry, GateEntryStatus, GoodsReceiptLine, GoodsReceiptNote
from apps.procurement.inbound_services import post_grn
from apps.procurement.models import Incoterm, Supplier
from apps.procurement.po_services import (
    PurchaseOrderError,
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.quality.qc import QCInspection
from apps.quality.qc_services import QCError, fail_inspection, pass_inspection
from apps.sales.commercial import SalesOrderStatus
from apps.sales.dispatch_services import DispatchError, add_dispatch_line, create_dispatch_note, post_dispatch
from apps.sales.so_services import add_so_line, confirm_sales_order, create_sales_order
from apps.warehouse.models import Bin, BinType, Warehouse


class Task3BackendRegressionTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Task3 Co", legal_name="Task3 Co Pvt Ltd")
        self.other_company = Company.objects.create(name="Other Co", legal_name="Other Co Pvt Ltd")
        self.npr, _ = Currency.objects.get_or_create(code="NPR", defaults={"name": "NPR"})
        self.kg, _ = UnitOfMeasure.objects.get_or_create(code="KG", defaults={"name": "Kilogram", "is_base_weight": True})
        self.fob, _ = Incoterm.objects.get_or_create(code="FOB", defaults={"name": "Free On Board", "version": "2020"})

        self.supplier = Supplier.objects.create(
            company=self.company,
            code="SUP-T3",
            legal_name="Supplier T3",
            trading_name="Supplier T3",
            preferred_incoterm=self.fob,
        )
        self.other_supplier = Supplier.objects.create(
            company=self.other_company,
            code="SUP-T3-OTHER",
            legal_name="Other Supplier",
            trading_name="Other Supplier",
            preferred_incoterm=self.fob,
        )

        self.customer = Customer.objects.create(
            company=self.company,
            code="CUS-T3",
            legal_name="Customer T3",
            trading_name="Customer T3",
            credit_limit=Decimal("1000000"),
        )
        self.other_customer = Customer.objects.create(
            company=self.other_company,
            code="CUS-T3-OTHER",
            legal_name="Other Customer",
            trading_name="Other Customer",
            credit_limit=Decimal("1000000"),
        )

        self.item = Item.objects.create(
            company=self.company,
            sku="RM-T3-001",
            name="Task 3 Item",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            coa_required=True,
            fifo_eligible=True,
        )
        self.other_item = Item.objects.create(
            company=self.other_company,
            sku="RM-T3-OTHER",
            name="Other Item",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            qc_required=True,
            fifo_eligible=True,
        )

        self.warehouse = Warehouse.objects.create(company=self.company, code="WH-T3", name="Warehouse T3")
        self.other_warehouse = Warehouse.objects.create(company=self.other_company, code="WH-T3-O", name="Other Warehouse")
        self.recv_bin = Bin.objects.create(warehouse=self.warehouse, code="RECV-T3", bin_type=BinType.RECEIVING)
        self.other_bin = Bin.objects.create(warehouse=self.other_warehouse, code="RECV-T3-O", bin_type=BinType.RECEIVING)

        self.user = User.objects.create_superuser(email="task3@ecowrap.com", password="Str0ng!Passw0rd")

    def _create_po(self, qty=Decimal("10"), item=None):
        item = item or self.item
        po = create_purchase_order(company=self.company, supplier=self.supplier, user=self.user, currency=self.npr)
        add_po_line(
            purchase_order=po,
            item=item,
            uom=self.kg,
            ordered_quantity=qty,
            user=self.user,
            unit_price=Decimal("12"),
            destination_warehouse=self.warehouse,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()
        if po.status == "SUBMITTED":
            approve_purchase_order(purchase_order=po, user=self.user)
        return po

    def _create_grn(self, po, qty, lot_number, *, accepted=None, purchase_order_line=None):
        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number=f"GE-{lot_number}",
            entry_at=timezone.now(),
            supplier=self.supplier,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number=f"GRN-{lot_number}",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.recv_bin,
            received_at=timezone.now(),
            currency=self.npr,
        )
        pol = purchase_order_line or po.lines.get()
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.kg,
            received_quantity=Decimal(str(qty)),
            accepted_quantity=Decimal(str(accepted if accepted is not None else qty)),
            purchase_order_line=pol,
            purchase_unit_cost=Decimal("12"),
            lot_number=lot_number,
        )
        return grn

    def test_validation_rejects_invalid_supplier_customer_warehouse_bin_and_cross_company_access(self):
        po = create_purchase_order(company=self.company, supplier=self.supplier, user=self.user, currency=self.npr)

        with self.assertRaises(ERPError):
            create_purchase_order(company=self.company, supplier=self.other_supplier, user=self.user, currency=self.npr)

        with self.assertRaises(ERPError):
            add_po_line(
                purchase_order=po,
                item=self.other_item,
                uom=self.kg,
                ordered_quantity=Decimal("5"),
                user=self.user,
                destination_warehouse=self.warehouse,
            )

        with self.assertRaises(ERPError):
            add_po_line(
                purchase_order=po,
                item=self.item,
                uom=self.kg,
                ordered_quantity=Decimal("5"),
                user=self.user,
                destination_warehouse=self.other_warehouse,
            )

        so = create_sales_order(company=self.company, customer=self.customer, user=self.user, currency=self.npr)
        with self.assertRaises(ERPError):
            create_sales_order(company=self.company, customer=self.other_customer, user=self.user, currency=self.npr)

        with self.assertRaises(ERPError):
            add_so_line(
                sales_order=so,
                item=self.other_item,
                uom=self.kg,
                ordered_quantity=Decimal("4"),
                user=self.user,
                warehouse=self.warehouse,
            )

        with self.assertRaises(ERPError):
            add_so_line(
                sales_order=so,
                item=self.item,
                uom=self.kg,
                ordered_quantity=Decimal("4"),
                user=self.user,
                warehouse=self.other_warehouse,
            )

        gate = GateEntry.objects.create(
            company=self.company,
            gate_entry_number="GE-T3-INVALID-REF",
            entry_at=timezone.now(),
            supplier=self.supplier,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company,
            grn_number="GRN-T3-INVALID-REF",
            gate_entry=gate,
            supplier=self.supplier,
            warehouse=self.warehouse,
            receiving_bin=self.other_bin,
            received_at=timezone.now(),
            currency=self.npr,
        )
        with self.assertRaises(ERPError):
            post_grn(grn=grn, user=self.user)

    def test_purchase_creation_line_validation_and_grn_receiving_rules(self):
        po = self._create_po(Decimal("12"))
        po.refresh_from_db()
        self.assertEqual(po.status, "APPROVED")

        with self.assertRaises(PurchaseOrderError):
            add_po_line(
                purchase_order=po,
                item=self.item,
                uom=self.kg,
                ordered_quantity=Decimal("0"),
                user=self.user,
                unit_price=Decimal("5"),
            )

        invalid_grn = self._create_grn(
            po,
            Decimal("0"),
            "LOT-T3-ZERO",
            accepted=Decimal("0"),
        )
        with self.assertRaises(ERPError):
            post_grn(grn=invalid_grn, user=self.user)

        valid_grn = self._create_grn(po, Decimal("8"), "LOT-T3-VALID", accepted=Decimal("8"))
        posted = post_grn(grn=valid_grn, user=self.user)
        self.assertEqual(posted.status, "POSTED")
        self.assertTrue(InventoryLot.objects.filter(lot_number="LOT-T3-VALID").exists())

    def test_qc_pass_fail_and_invalid_transition(self):
        po = self._create_po(Decimal("12"))
        grn = self._create_grn(po, Decimal("12"), "LOT-T3-QC")
        post_grn(grn=grn, user=self.user)
        inspection = QCInspection.objects.get(grn=grn)

        inspection.coa_reference = ""
        inspection.save(update_fields=["coa_reference", "updated_at"])
        with self.assertRaises(QCError) as ctx:
            pass_inspection(inspection=inspection, user=self.user)
        self.assertEqual(ctx.exception.code, "COA_REQUIRED")

        inspection.coa_reference = "COA-T3-001"
        inspection.save(update_fields=["coa_reference", "updated_at"])
        passed = pass_inspection(inspection=inspection, user=self.user)
        self.assertEqual(passed.status, "PASSED")
        lot = passed.lot
        lot.refresh_from_db()
        self.assertEqual(lot.status, LotStatus.AVAILABLE)

        second_po = self._create_po(Decimal("8"))
        second_grn = self._create_grn(second_po, Decimal("8"), "LOT-T3-QC-FAIL")
        post_grn(grn=second_grn, user=self.user)
        failed = fail_inspection(inspection=QCInspection.objects.get(grn=second_grn), user=self.user)
        failed_lot = failed.lot
        failed_lot.refresh_from_db()
        self.assertEqual(failed_lot.status, LotStatus.QUARANTINED)

        with self.assertRaises(InvalidStatusTransitionError):
            transition_lot_status(failed_lot, LotStatus.AVAILABLE, user=self.user)

    def test_inventory_balances_reservation_and_sales_dispatch_validation(self):
        po = self._create_po(Decimal("30"))
        grn = self._create_grn(po, Decimal("30"), "LOT-T3-INV")
        post_grn(grn=grn, user=self.user)
        inspection = QCInspection.objects.get(grn=grn)
        inspection.coa_reference = "COA-T3-INV"
        inspection.save(update_fields=["coa_reference", "updated_at"])
        pass_inspection(inspection=inspection, user=self.user)

        balances = compute_balances(company=self.company, item=self.item)
        self.assertEqual(balances["available"], "30.000000")
        lot = InventoryLot.objects.get(lot_number="LOT-T3-INV")
        self.assertEqual(lot.remaining_quantity, Decimal("30"))

        reservation = reserve_stock(
            company=self.company,
            item=self.item,
            quantity=Decimal("10"),
            uom=self.kg,
            user=self.user,
            warehouse=self.warehouse,
            reference_type="TEST",
            reference_id=lot.id,
            notes="reserve for task3",
        )
        self.assertEqual(reservation.quantity, Decimal("10"))
        self.assertEqual(reservation.status, ReservationStatus.OPEN)

        with self.assertRaises(ReservationError):
            reserve_stock(
                company=self.company,
                item=self.item,
                quantity=Decimal("99"),
                uom=self.kg,
                user=self.user,
                warehouse=self.warehouse,
                reference_type="TEST",
                reference_id=lot.id,
                notes="oversized reserve",
            )

        so = create_sales_order(company=self.company, customer=self.customer, user=self.user, currency=self.npr)
        line = add_so_line(
            sales_order=so,
            item=self.item,
            uom=self.kg,
            ordered_quantity=Decimal("15"),
            user=self.user,
            warehouse=self.warehouse,
            unit_price=Decimal("30"),
        )
        confirm_sales_order(sales_order=so, user=self.user)
        so.refresh_from_db()
        self.assertEqual(so.status, SalesOrderStatus.RESERVED)

        dispatch = create_dispatch_note(sales_order=so, user=self.user, warehouse=self.warehouse)
        with self.assertRaises(DispatchError):
            add_dispatch_line(dispatch=dispatch, sales_order_line=line, quantity=Decimal("0"), user=self.user)

        add_dispatch_line(dispatch=dispatch, sales_order_line=line, quantity=Decimal("10"), user=self.user)
        posted = post_dispatch(dispatch=dispatch, user=self.user)
        self.assertEqual(posted.status, "POSTED")
