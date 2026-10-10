from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.ledger import StockLedgerEntry
from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    ItemType,
    UnitOfMeasure,
)
from apps.organization.models import Company, Currency
from apps.organization.company_scope import CompanyAccessDenied
from apps.procurement.inbound import (
    GateEntry,
    GateEntryStatus,
    GoodsReceiptLine,
    GoodsReceiptNote,
    GrnStatus,
    ImportShipment,
)
from apps.procurement.inbound_services import InboundError, post_grn
from apps.procurement.models import Supplier
from apps.procurement.po_services import (
    add_po_line,
    approve_purchase_order,
    create_purchase_order,
    submit_purchase_order,
)
from apps.warehouse.models import Bin, BinType, Warehouse


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
)
class PostGrnCompanyReferenceTests(APITestCase):
    api = "/api/v1/purchase/goods-receipts/"

    def setUp(self):
        self.company_a = Company.objects.create(name="GRN Company A", legal_name="GRN Company A Ltd")
        self.company_b = Company.objects.create(name="GRN Company B", legal_name="GRN Company B Ltd")
        self.user = User.objects.create_superuser(
            email="grn-company-reference@example.com",
            password="Str0ng!Passw0rd",
        )
        self.client.force_authenticate(self.user)

        self.currency, _ = Currency.objects.get_or_create(
            code="NPR", defaults={"name": "Nepalese Rupee"}
        )
        self.uom, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "is_base_weight": True}
        )
        self.supplier_a = Supplier.objects.create(
            company=self.company_a,
            code="GRN-SUP-A",
            legal_name="GRN Supplier A",
            trading_name="Supplier A",
            currency=self.currency,
        )
        self.supplier_b = Supplier.objects.create(
            company=self.company_b,
            code="GRN-SUP-B",
            legal_name="GRN Supplier B",
            trading_name="Supplier B",
            currency=self.currency,
        )
        self.item = Item.objects.create(
            company=self.company_a,
            sku="GRN-ITEM-A",
            name="GRN Item A",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.uom,
            purchase_uom=self.uom,
            stock_uom=self.uom,
            qc_required=False,
            fifo_eligible=True,
        )
        self.warehouse = Warehouse.objects.create(
            company=self.company_a,
            code="GRN-WH-A",
            name="GRN Warehouse A",
        )
        self.receiving_bin = Bin.objects.create(
            warehouse=self.warehouse,
            code="GRN-RECV-A",
            bin_type=BinType.RECEIVING,
        )
        self.foreign_shipment = ImportShipment.objects.create(
            company=self.company_b,
            shipment_number="GRN-SHIP-B",
            supplier=self.supplier_b,
        )
        self.foreign_gate = GateEntry.objects.create(
            company=self.company_b,
            gate_entry_number="GRN-GATE-B",
            entry_at=timezone.now(),
            supplier=self.supplier_b,
            status=GateEntryStatus.SUBMITTED,
        )

    def _make_grn(self, *, gate_entry=None, shipment=None, suffix="TEST"):
        grn = GoodsReceiptNote.objects.create(
            company=self.company_a,
            grn_number=f"GRN-A-{suffix}",
            gate_entry=gate_entry,
            shipment=shipment,
            supplier=self.supplier_a,
            warehouse=self.warehouse,
            receiving_bin=self.receiving_bin,
            received_at=timezone.now(),
            currency=self.currency,
        )
        GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.uom,
            received_quantity=Decimal("5"),
            accepted_quantity=Decimal("5"),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-A-{suffix}",
        )
        return grn

    def _make_po_backed_grn(self, *, suffix, qty="50"):
        po = create_purchase_order(
            company=self.company_a,
            supplier=self.supplier_a,
            user=self.user,
            currency=self.currency,
            destination_warehouse=self.warehouse,
        )
        po_line = add_po_line(
            purchase_order=po,
            item=self.item,
            uom=self.uom,
            ordered_quantity=Decimal("100"),
            unit_price=Decimal("10"),
            tax_pct=Decimal("0"),
            user=self.user,
        )
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        po.refresh_from_db()

        gate = GateEntry.objects.create(
            company=self.company_a,
            gate_entry_number=f"GRN-GATE-{suffix}",
            entry_at=timezone.now(),
            supplier=self.supplier_a,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company_a,
            grn_number=f"GRN-A-{suffix}",
            gate_entry=gate,
            supplier=self.supplier_a,
            warehouse=self.warehouse,
            receiving_bin=self.receiving_bin,
            received_at=timezone.now(),
            currency=self.currency,
        )
        line = GoodsReceiptLine.objects.create(
            grn=grn,
            item=self.item,
            uom=self.uom,
            received_quantity=Decimal(qty),
            accepted_quantity=Decimal(qty),
            purchase_unit_cost=Decimal("10"),
            lot_number=f"LOT-A-{suffix}",
            purchase_order_line=po_line,
        )
        return grn, gate, po, line

    def _inventory_counts(self):
        return (
            InventoryLot.objects.count(),
            InventoryReceiptLayer.objects.count(),
            StockLedgerEntry.objects.count(),
        )

    def _api_payload(self, *, gate_entry=None, shipment=None, grn_number="GRN-API-A"):
        return {
            "company": str(self.company_a.pk),
            "grn_number": grn_number,
            "gate_entry": str(gate_entry.pk) if gate_entry else None,
            "shipment": str(shipment.pk) if shipment else None,
            "supplier": str(self.supplier_a.pk),
            "warehouse": str(self.warehouse.pk),
            "received_at": timezone.now().isoformat(),
            "currency": str(self.currency.pk),
        }

    def _assert_cross_company_error(self, response):
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data["error"]["code"], "CROSS_COMPANY_REFERENCE")

    def test_post_grn_rejects_foreign_gate_before_inventory_writes(self):
        grn = self._make_grn(gate_entry=self.foreign_gate, suffix="FOREIGN-GATE")
        counts_before = self._inventory_counts()

        with self.assertRaises(CompanyAccessDenied) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "CROSS_COMPANY_REFERENCE")
        grn.refresh_from_db()
        self.foreign_gate.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(self.foreign_gate.status, GateEntryStatus.SUBMITTED)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_post_grn_rejects_foreign_shipment_before_inventory_writes(self):
        grn = self._make_grn(shipment=self.foreign_shipment, suffix="FOREIGN-SHIP")
        shipment_before = (
            self.foreign_shipment.company_id,
            self.foreign_shipment.supplier_id,
            self.foreign_shipment.is_active,
            self.foreign_shipment.notes,
        )
        counts_before = self._inventory_counts()

        with self.assertRaises(CompanyAccessDenied) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "CROSS_COMPANY_REFERENCE")
        grn.refresh_from_db()
        self.foreign_shipment.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(
            (
                self.foreign_shipment.company_id,
                self.foreign_shipment.supplier_id,
                self.foreign_shipment.is_active,
                self.foreign_shipment.notes,
            ),
            shipment_before,
        )
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_post_grn_rejects_receiving_bin_from_another_warehouse(self):
        other_warehouse = Warehouse.objects.create(
            company=self.company_a,
            code="GRN-WH-OTHER",
            name="Other GRN Warehouse",
        )
        other_bin = Bin.objects.create(
            warehouse=other_warehouse,
            code="GRN-RECV-OTHER",
            bin_type=BinType.RECEIVING,
        )
        grn = self._make_grn(suffix="BIN-MISMATCH")
        grn.receiving_bin = other_bin
        grn.save(update_fields=["receiving_bin"])
        counts_before = self._inventory_counts()

        with self.assertRaises(InboundError) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "BIN_WAREHOUSE_MISMATCH")
        grn.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_post_grn_accepts_receiving_bin_from_same_warehouse(self):
        grn = self._make_grn(suffix="BIN-VALID")

        posted = post_grn(grn=grn, user=self.user)

        self.assertEqual(posted.status, GrnStatus.POSTED)
        posted.refresh_from_db()
        self.assertEqual(posted.receiving_bin_id, self.receiving_bin.pk)

    def test_post_grn_rejects_duplicate_post_without_more_inventory_writes(self):
        grn, gate, po, _line = self._make_po_backed_grn(suffix="DUPLICATE")
        post_grn(grn=grn, user=self.user)
        counts_after_first_post = self._inventory_counts()
        po.refresh_from_db()
        po_status_after_first_post = po.status

        with self.assertRaises(InboundError) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "DUPLICATE_POST")
        grn.refresh_from_db()
        gate.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.POSTED)
        self.assertEqual(gate.status, GateEntryStatus.LINKED_TO_GRN)
        self.assertEqual(po.status, po_status_after_first_post)
        self.assertEqual(self._inventory_counts(), counts_after_first_post)

    def test_post_grn_rejects_over_receipt_without_partial_state(self):
        grn, gate, _po, line = self._make_po_backed_grn(
            suffix="OVER-RECEIPT",
            qty="105",
        )
        counts_before = self._inventory_counts()

        with self.assertRaises(InboundError) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "OVER_RECEIPT")
        grn.refresh_from_db()
        gate.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(gate.status, GateEntryStatus.SUBMITTED)
        self.assertIsNone(line.lot_id)
        self.assertIsNone(line.receipt_layer_id)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_post_grn_rolls_back_multiline_grn_when_later_line_fails(self):
        po = create_purchase_order(
            company=self.company_a,
            supplier=self.supplier_a,
            user=self.user,
            currency=self.currency,
            destination_warehouse=self.warehouse,
        )
        po_lines = [
            add_po_line(
                purchase_order=po,
                item=self.item,
                uom=self.uom,
                ordered_quantity=Decimal("100"),
                unit_price=Decimal("10"),
                tax_pct=Decimal("0"),
                user=self.user,
            )
            for _ in range(2)
        ]
        submit_purchase_order(purchase_order=po, user=self.user)
        approve_purchase_order(purchase_order=po, user=self.user)
        gate = GateEntry.objects.create(
            company=self.company_a,
            gate_entry_number="GRN-GATE-MULTILINE",
            entry_at=timezone.now(),
            supplier=self.supplier_a,
            purchase_order=po,
            status=GateEntryStatus.SUBMITTED,
        )
        grn = GoodsReceiptNote.objects.create(
            company=self.company_a,
            grn_number="GRN-A-MULTILINE",
            gate_entry=gate,
            supplier=self.supplier_a,
            warehouse=self.warehouse,
            receiving_bin=self.receiving_bin,
            received_at=timezone.now(),
            currency=self.currency,
        )
        lines = [
            GoodsReceiptLine.objects.create(
                grn=grn,
                item=self.item,
                uom=self.uom,
                received_quantity=Decimal(qty),
                accepted_quantity=Decimal(qty),
                purchase_unit_cost=Decimal("10"),
                lot_number=f"LOT-A-MULTILINE-{index}",
                purchase_order_line=po_line,
            )
            for index, (qty, po_line) in enumerate(
                zip(("60", "105"), po_lines),
                start=1,
            )
        ]
        counts_before = self._inventory_counts()
        po.refresh_from_db()
        po_status_before = po.status

        with self.assertRaises(InboundError) as context:
            post_grn(grn=grn, user=self.user)

        self.assertEqual(context.exception.code, "OVER_RECEIPT")
        grn.refresh_from_db()
        gate.refresh_from_db()
        po.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(gate.status, GateEntryStatus.SUBMITTED)
        self.assertEqual(po.status, po_status_before)
        for line in lines:
            line.refresh_from_db()
            self.assertIsNone(line.lot_id)
            self.assertIsNone(line.receipt_layer_id)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_post_grn_rolls_back_inventory_writes_when_ledger_write_fails(self):
        grn = self._make_grn(suffix="ROLLBACK")
        counts_before = self._inventory_counts()

        with patch(
            "apps.procurement.inbound_services.append_ledger_entry",
            side_effect=InboundError("Simulated ledger failure."),
        ):
            with self.assertRaises(InboundError):
                post_grn(grn=grn, user=self.user)

        grn.refresh_from_db()
        grn_line = grn.lines.get()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertIsNone(grn_line.lot_id)
        self.assertIsNone(grn_line.receipt_layer_id)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_api_post_rejects_foreign_gate_before_inventory_writes(self):
        grn = self._make_grn(gate_entry=self.foreign_gate, suffix="API-POST-GATE")
        counts_before = self._inventory_counts()

        response = self.client.post(f"{self.api}{grn.pk}/post/")

        self._assert_cross_company_error(response)
        grn.refresh_from_db()
        self.foreign_gate.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(self.foreign_gate.status, GateEntryStatus.SUBMITTED)
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_api_post_rejects_foreign_shipment_before_inventory_writes(self):
        grn = self._make_grn(shipment=self.foreign_shipment, suffix="API-POST-SHIP")
        shipment_before = self.foreign_shipment.company_id, self.foreign_shipment.is_active
        counts_before = self._inventory_counts()

        response = self.client.post(f"{self.api}{grn.pk}/post/")

        self._assert_cross_company_error(response)
        grn.refresh_from_db()
        self.foreign_shipment.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertEqual(
            (self.foreign_shipment.company_id, self.foreign_shipment.is_active),
            shipment_before,
        )
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_api_create_rejects_foreign_gate_entry(self):
        counts_before = self._inventory_counts()
        response = self.client.post(
            self.api,
            self._api_payload(gate_entry=self.foreign_gate, grn_number="GRN-API-GATE"),
            format="json",
        )

        self._assert_cross_company_error(response)
        self.foreign_gate.refresh_from_db()
        self.assertEqual(self.foreign_gate.status, GateEntryStatus.SUBMITTED)
        self.assertFalse(GoodsReceiptNote.objects.filter(grn_number="GRN-API-GATE").exists())
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_api_create_rejects_foreign_shipment(self):
        counts_before = self._inventory_counts()
        shipment_before = self.foreign_shipment.company_id, self.foreign_shipment.is_active
        response = self.client.post(
            self.api,
            self._api_payload(shipment=self.foreign_shipment, grn_number="GRN-API-SHIP"),
            format="json",
        )

        self._assert_cross_company_error(response)
        self.foreign_shipment.refresh_from_db()
        self.assertEqual(
            (self.foreign_shipment.company_id, self.foreign_shipment.is_active),
            shipment_before,
        )
        self.assertFalse(GoodsReceiptNote.objects.filter(grn_number="GRN-API-SHIP").exists())
        self.assertEqual(self._inventory_counts(), counts_before)

    def test_api_update_rejects_foreign_gate_or_shipment(self):
        grn = self._make_grn(suffix="API-UPDATE")
        update_url = f"{self.api}{grn.pk}/"
        counts_before = self._inventory_counts()

        gate_response = self.client.patch(
            update_url,
            {"gate_entry": str(self.foreign_gate.pk)},
            format="json",
        )
        self._assert_cross_company_error(gate_response)

        shipment_response = self.client.patch(
            update_url,
            {"shipment": str(self.foreign_shipment.pk)},
            format="json",
        )
        self._assert_cross_company_error(shipment_response)

        grn.refresh_from_db()
        self.foreign_gate.refresh_from_db()
        self.foreign_shipment.refresh_from_db()
        self.assertEqual(grn.status, GrnStatus.DRAFT)
        self.assertIsNone(grn.gate_entry_id)
        self.assertIsNone(grn.shipment_id)
        self.assertEqual(self.foreign_gate.status, GateEntryStatus.SUBMITTED)
        self.assertEqual(self.foreign_shipment.company_id, self.company_b.pk)
        self.assertEqual(self._inventory_counts(), counts_before)
