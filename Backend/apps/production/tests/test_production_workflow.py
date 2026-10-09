"""
Production workflow service tests.

Covers:
- production order creation
- company isolation
- warehouse/bin ownership
- BOM activation requirements
- BOM material requirement calculation
- production order release
- material reservation
- QC hold exclusion
- insufficient-stock rollback
- material issue posting
- FIFO multi-layer consumption
- duplicate posting protection
- issue ledger entries
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.inventory.ledger import (
    ReservationStatus,
    StockLedgerEntry,
    StockReservation,
    StockTxnType,
)
from apps.quality.qc import QCInspection, QCInspectionStatus
from apps.inventory.models import (
    InventoryLot,
    InventoryReceiptLayer,
    Item,
    ItemType,
    LotStatus,
    UnitOfMeasure,
)
from apps.organization.models import Company
from apps.production.models import (
    BOM,
    BOMLine,
    BOMVersion,
    BOMVersionStatus,
    MaterialIssue,
    MaterialIssueLine,
    ProductionDocumentStatus,
    ProductionOrder,
    ProductionOrderStatus,
    ProductionOutput,
    ProductionOutputLine,
    ProductionLotTraceability,
)
from apps.production.services import (
    BOMError,
    MaterialIssueError,
    ProductionOrderError,
    ProductionOutputError,
    add_bom_line,
    create_bom,
    create_bom_version,
    create_production_order,
    create_production_output,
    post_material_issue,
    post_production_output,
    release_production_order,
)
from apps.warehouse.models import Bin, BinType, Warehouse


class ProductionWorkflowTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="EcoWrap Production",
            legal_name="EcoWrap Production Pvt",
        )

        self.other = Company.objects.create(
            name="Other Production",
            legal_name="Other Production Ltd",
        )

        self.user = User.objects.create_superuser(
            email="production@ecowrap.com",
            password="Str0ng!Passw0rd",
        )

        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG",
            defaults={
                "name": "Kilogram",
                "is_base_weight": True,
            },
        )

        self.output_item = Item.objects.create(
            company=self.company,
            sku="FG-PROD-001",
            name="Finished Product",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

        self.component_item = Item.objects.create(
            company=self.company,
            sku="RM-PROD-001",
            name="Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

        self.second_component = Item.objects.create(
            company=self.company,
            sku="RM-PROD-002",
            name="Second Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

        self.other_output_item = Item.objects.create(
            company=self.other,
            sku="FG-OTHER-001",
            name="Other Finished Product",
            item_type=ItemType.FINISHED_GOOD,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

        self.warehouse = Warehouse.objects.create(
            company=self.company,
            code="WH-PROD",
            name="Production Warehouse",
        )

        self.production_bin = Bin.objects.create(
            warehouse=self.warehouse,
            code="PROD-01",
            bin_type=BinType.PRODUCTION,
        )

        self.finished_bin = Bin.objects.create(
            warehouse=self.warehouse,
            code="FG-01",
            bin_type=BinType.FINISHED_GOODS,
        )

        self.other_warehouse = Warehouse.objects.create(
            company=self.other,
            code="WH-OTHER",
            name="Other Warehouse",
        )

        self.other_bin = Bin.objects.create(
            warehouse=self.other_warehouse,
            code="OTHER-01",
            bin_type=BinType.PRODUCTION,
        )

    def _bom(self, code="BOM-PROD-001"):
        return create_bom(
            company=self.company,
            code=code,
            name="Production BOM",
            output_item=self.output_item,
            user=self.user,
        )

    def _active_bom(self):
        bom = self._bom()

        version = create_bom_version(
            bom=bom,
            version=1,
            user=self.user,
            effective_from=date(2026, 1, 1),
        )

        version.status = BOMVersionStatus.ACTIVE
        version.save(update_fields=["status", "updated_at"])

        bom.status = "ACTIVE"
        bom.save(update_fields=["status", "updated_at"])

        line = add_bom_line(
            bom_version=version,
            component_item=self.component_item,
            quantity=Decimal("2"),
            uom=self.kg,
            scrap_percent=Decimal("10"),
            sequence=1,
            user=self.user,
        )

        return bom, version, line

    def _available_layer(
        self,
        *,
        quantity="100",
        cost="1000",
        suffix="001",
        status=LotStatus.AVAILABLE,
        receipt_sequence=1,
        warehouse=None,
        bin=None,
    ):
        lot = InventoryLot.objects.create(
            company=self.company,
            lot_number=f"LOT-PROD-{suffix}",
            item=self.component_item,
            uom=self.kg,
            initial_quantity=Decimal(quantity),
            remaining_quantity=Decimal(quantity),
            purchase_unit_cost=Decimal(cost),
            status=status,
            qc_status="N/A" if status == LotStatus.AVAILABLE else "HOLD",
        )

        layer = InventoryReceiptLayer.objects.create(
            company=self.company,
            lot=lot,
            item=self.component_item,
            warehouse=warehouse or self.warehouse,
            bin=bin or self.production_bin,
            received_at=datetime.now(timezone.utc),
            receipt_sequence=receipt_sequence,
            uom=self.kg,
            initial_quantity=Decimal(quantity),
            remaining_quantity=Decimal(quantity),
            purchase_unit_cost=Decimal(cost),
        )

        return lot, layer

    def _production_order(self, *, quantity="10"):
        _, version, _ = self._active_bom()

        return create_production_order(
            company=self.company,
            bom_version=version,
            planned_quantity=Decimal(quantity),
            uom=self.kg,
            warehouse=self.warehouse,
            production_bin=self.production_bin,
            user=self.user,
        )

    def _production_output(self, order, quantity=Decimal("5")):
        return create_production_output(
            company=self.company,
            production_order=order,
            quantity=quantity,
            uom=self.kg,
            warehouse=self.warehouse,
            output_bin=self.finished_bin,
            user=self.user,
        )

    def test_create_production_order(self):
        order = self._production_order(quantity="10")

        self.assertEqual(order.company_id, self.company.id)
        self.assertEqual(order.output_item_id, self.output_item.id)
        self.assertEqual(order.planned_quantity, Decimal("10"))
        self.assertEqual(order.produced_quantity, Decimal("0"))
        self.assertEqual(
            order.status,
            ProductionOrderStatus.DRAFT,
        )
        self.assertEqual(order.warehouse_id, self.warehouse.id)
        self.assertEqual(order.production_bin_id, self.production_bin.id)

    def test_create_production_order_rejects_cross_company_warehouse(self):
        _, version, _ = self._active_bom()

        with self.assertRaises(ProductionOrderError) as ctx:
            create_production_order(
                company=self.company,
                bom_version=version,
                planned_quantity=Decimal("10"),
                uom=self.kg,
                warehouse=self.other_warehouse,
                production_bin=self.other_bin,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "WAREHOUSE_COMPANY_MISMATCH")

    def test_create_production_order_rejects_bin_from_other_warehouse(self):
        _, version, _ = self._active_bom()

        with self.assertRaises(ProductionOrderError) as ctx:
            create_production_order(
                company=self.company,
                bom_version=version,
                planned_quantity=Decimal("10"),
                uom=self.kg,
                warehouse=self.warehouse,
                production_bin=self.other_bin,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "BIN_WAREHOUSE_MISMATCH")

    def test_production_output_posts_fg_lot_and_completes_order(self):
        self._available_layer(
            quantity="100",
            suffix="OUTPUT",
        )

        order = self._production_order(quantity="10")

        release_production_order(
            production_order=order,
            user=self.user,
        )

        material_issue = order.material_issues.get()

        post_material_issue(
            material_issue=material_issue,
            user=self.user,
        )

        output = self._production_output(
            order,
            quantity=Decimal("10"),
        )

        posted_output, lot, layer = post_production_output(
            company=self.company,
            production_output=output,
            user=self.user,
        )

        posted_output.refresh_from_db()
        order.refresh_from_db()
        lot.refresh_from_db()
        layer.refresh_from_db()

        self.assertEqual(
            posted_output.status,
            ProductionDocumentStatus.POSTED,
        )

        self.assertEqual(
            order.status,
            ProductionOrderStatus.COMPLETED,
        )

        self.assertEqual(
            order.produced_quantity,
            Decimal("10"),
        )

        self.assertEqual(
            lot.item_id,
            self.output_item.id,
        )

        self.assertEqual(
            lot.remaining_quantity,
            Decimal("10"),
        )

        self.assertEqual(
            lot.genealogy_reference,
            posted_output.document_number,
        )

        self.assertEqual(
            layer.item_id,
            self.output_item.id,
        )

        self.assertEqual(
            layer.remaining_quantity,
            Decimal("10"),
        )

        output_line = posted_output.lines.get()

        self.assertEqual(
            output_line.lot_id,
            lot.id,
        )

        material_issue_line = material_issue.lines.get()
        traceability = ProductionLotTraceability.objects.get(
            production_order=order,
            material_issue_line=material_issue_line,
            output_line=output_line,
            output_lot=lot,
        )
        self.assertEqual(traceability.company_id, self.company.id)
        self.assertEqual(traceability.consumed_lot_id, material_issue_line.lot_id)
        self.assertEqual(traceability.consumed_layer_id, material_issue_line.receipt_layer_id)
        self.assertEqual(traceability.quantity_consumed, Decimal("22"))
    def test_production_output_requires_posted_material_issue(self):
        self._available_layer(
            quantity="100",
            suffix="REQUIRES-ISSUE",
        )
        order = self._production_order()

        release_production_order(
            production_order=order,
            user=self.user,
        )

        output = self._production_output(
            order,
            quantity=Decimal("5"),
        )

        with self.assertRaises(ProductionOutputError) as ctx:
            post_production_output(
                company=self.company,
                production_output=output,
                user=self.user,
            )

        self.assertEqual(
            ctx.exception.code,
            "MATERIAL_ISSUE_REQUIRED",
        )

        output.refresh_from_db()

        self.assertEqual(
            output.status,
            ProductionDocumentStatus.DRAFT,
        )


    def test_production_output_cannot_be_posted_twice(self):
        self._available_layer(
            quantity="100",
            suffix="DUPLICATE",
        )
        order = self._production_order()

        release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=order.material_issues.get(),
            user=self.user,
        )

        output = self._production_output(
            order,
            quantity=Decimal("5"),
        )

        post_production_output(
            company=self.company,
            production_output=output,
            user=self.user,
        )

        with self.assertRaises(ProductionOutputError) as ctx:
            post_production_output(
                company=self.company,
                production_output=output,
                user=self.user,
            )

        self.assertEqual(
            ctx.exception.code,
            "OUTPUT_ALREADY_POSTED",
        )


    def test_production_output_cannot_exceed_remaining_plan(self):
        self._available_layer(
            quantity="100",
            suffix="EXCEEDS-PLAN",
        )

        order = self._production_order()

        release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=order.material_issues.get(),
            user=self.user,
        )

        with self.assertRaises(ProductionOutputError) as ctx:
            self._production_output(
                order,
                quantity=Decimal("11"),
            )

        self.assertEqual(
            ctx.exception.code,
            "OUTPUT_QTY_EXCEEDS_PLAN",
        )

        order.refresh_from_db()

        self.assertEqual(
            order.produced_quantity,
            Decimal("0"),
        )

        self.assertFalse(
            ProductionOutput.objects.filter(
                production_order=order,
            ).exists()
        )


    def test_production_output_with_qc_required_starts_on_qc_hold(self):
        self.output_item.qc_required = True
        self.output_item.save(
            update_fields=["qc_required"],
        )

        self._available_layer(
            quantity="100",
            suffix="QC-OUTPUT",
        )
        order = self._production_order()

        release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=order.material_issues.get(),
            user=self.user,
        )

        output = self._production_output(
            order,
            quantity=Decimal("5"),
        )

        _, lot, _ = post_production_output(
            company=self.company,
            production_output=output,
            user=self.user,
        )

        lot.refresh_from_db()

        self.assertEqual(
            lot.status,
            LotStatus.QC_HOLD,
        )

        self.assertEqual(
            lot.qc_status,
            "HOLD",
        )

        self.assertTrue(
            QCInspection.objects.filter(
                company=self.company,
                lot=lot,
                item=self.output_item,
                status=QCInspectionStatus.DRAFT,
            ).exists()
        )

    def test_create_production_order_requires_active_bom(self):
        bom = self._bom()

        version = create_bom_version(
            bom=bom,
            version=1,
            user=self.user,
            effective_from=date(2026, 1, 1),
        )

        with self.assertRaises(ProductionOrderError) as ctx:
            create_production_order(
                company=self.company,
                bom_version=version,
                planned_quantity=Decimal("10"),
                uom=self.kg,
                warehouse=self.warehouse,
                production_bin=self.production_bin,
                user=self.user,
            )

        self.assertEqual(
            ctx.exception.code,
            "BOM_VERSION_NOT_ACTIVE",
        )
    def test_release_creates_material_issue_and_reservation(self):
        self._available_layer(quantity="100", suffix="REL")

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        order.refresh_from_db()

        self.assertEqual(
            order.status,
            ProductionOrderStatus.RELEASED,
        )

        self.assertEqual(
            material_issue.production_order_id,
            order.id,
        )

        self.assertEqual(
            material_issue.lines.count(),
            1,
        )

        line = material_issue.lines.get()

        self.assertEqual(
            line.item_id,
            self.component_item.id,
        )

        # 10 output Ã— 2 BOM quantity Ã— 110% scrap = 22 KG
        self.assertEqual(
            line.quantity,
            Decimal("22"),
        )

        reservation = StockReservation.objects.get(
            reference_type="PRODUCTION_MATERIAL",
            reference_id=line.id,
        )

        self.assertEqual(
            reservation.status,
            ReservationStatus.OPEN,
        )

        self.assertEqual(
            reservation.quantity,
            Decimal("22"),
        )

    def test_release_excludes_qc_hold_stock(self):
        self._available_layer(
            quantity="10",
            suffix="AVAILABLE",
        )

        self._available_layer(
            quantity="100",
            suffix="HOLD",
            status=LotStatus.QC_HOLD,
            receipt_sequence=2,
        )

        order = self._production_order(quantity="10")

        with self.assertRaises(Exception):
            release_production_order(
                production_order=order,
                user=self.user,
            )

        self.assertFalse(
            StockReservation.objects.filter(
                reference_type="PRODUCTION_MATERIAL"
            ).exists()
        )

    def test_release_insufficient_stock_rolls_back(self):
        self._available_layer(
            quantity="10",
            suffix="SHORT",
        )

        order = self._production_order(quantity="10")

        with self.assertRaises(Exception):
            release_production_order(
                production_order=order,
                user=self.user,
            )

        order.refresh_from_db()

        self.assertEqual(
            order.status,
            ProductionOrderStatus.DRAFT,
        )

        self.assertFalse(
            MaterialIssue.objects.filter(
                production_order=order
            ).exists()
        )

        self.assertFalse(
            StockReservation.objects.filter(
                reference_type="PRODUCTION_MATERIAL"
            ).exists()
        )

        layer = InventoryReceiptLayer.objects.get(
            lot__lot_number="LOT-PROD-SHORT"
        )

        self.assertEqual(
            layer.remaining_quantity,
            Decimal("10"),
        )

        self.assertEqual(
            layer.reserved_quantity,
            Decimal("0"),
        )

    def test_post_material_issue_consumes_reserved_stock(self):
        self._available_layer(
            quantity="100",
            suffix="POST",
        )

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=material_issue,
            user=self.user,
        )

        material_issue.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(
            material_issue.status,
            "POSTED",
        )

        self.assertEqual(
            order.status,
            ProductionOrderStatus.IN_PROGRESS,
        )

        layer = InventoryReceiptLayer.objects.get(
            lot__lot_number="LOT-PROD-POST"
        )

        self.assertEqual(
            layer.remaining_quantity,
            Decimal("78"),
        )

        self.assertEqual(
            layer.reserved_quantity,
            Decimal("0"),
        )

        self.assertTrue(
            StockLedgerEntry.objects.filter(
                txn_type=StockTxnType.ISSUE,
                reference_type="MATERIAL_ISSUE",
                reference_id=material_issue.id,
            ).exists()
        )

    def test_post_material_issue_is_duplicate_safe(self):
        self._available_layer(
            quantity="100",
            suffix="DUP",
        )

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=material_issue,
            user=self.user,
        )

        with self.assertRaises(MaterialIssueError):
            post_material_issue(
                material_issue=material_issue,
                user=self.user,
            )

        layer = InventoryReceiptLayer.objects.get(
            lot__lot_number="LOT-PROD-DUP"
        )

        self.assertEqual(
            layer.remaining_quantity,
            Decimal("78"),
        )

        self.assertEqual(
            StockLedgerEntry.objects.filter(
                txn_type=StockTxnType.ISSUE,
                reference_type="MATERIAL_ISSUE",
                reference_id=material_issue.id,
            ).count(),
            1,
        )

    def test_post_material_issue_consumes_multiple_fifo_layers(self):
        first_lot, first_layer = self._available_layer(
            quantity="10",
            cost="1000",
            suffix="FIFO1",
            receipt_sequence=1,
        )

        second_lot, second_layer = self._available_layer(
            quantity="20",
            cost="1200",
            suffix="FIFO2",
            receipt_sequence=2,
        )

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        post_material_issue(
            material_issue=material_issue,
            user=self.user,
        )

        first_layer.refresh_from_db()
        second_layer.refresh_from_db()

        self.assertEqual(
            first_layer.remaining_quantity,
            Decimal("0"),
        )

        self.assertEqual(
            second_layer.remaining_quantity,
            Decimal("8"),
        )

        self.assertEqual(
            material_issue.lines.count(),
            2,
        )

        line_lots = set(
            material_issue.lines.values_list(
                "lot_id",
                flat=True,
            )
        )

        self.assertEqual(
            line_lots,
            {first_lot.id, second_lot.id},
        )

    def test_material_issue_cannot_post_without_open_reservation(self):
        self._available_layer(
            quantity="100",
            suffix="NORES",
        )

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        StockReservation.objects.filter(
            reference_type="PRODUCTION_MATERIAL",
        ).update(
            status=ReservationStatus.RELEASED,
        )

        with self.assertRaises(MaterialIssueError):
            post_material_issue(
                material_issue=material_issue,
                user=self.user,
            )

    def test_create_production_order_rejects_cross_company_bom(self):
        bom = create_bom(
            company=self.other,
            code="BOM-OTHER-001",
            name="Other Company BOM",
            output_item=self.other_output_item,
            user=self.user,
        )

        version = create_bom_version(
            bom=bom,
            version=1,
            user=self.user,
            effective_from=date(2026, 1, 1),
        )

        version.status = BOMVersionStatus.ACTIVE
        version.save(update_fields=["status", "updated_at"])

        bom.status = "ACTIVE"
        bom.save(update_fields=["status", "updated_at"])

        with self.assertRaises(ProductionOrderError) as ctx:
            create_production_order(
                company=self.company,
                bom_version=version,
                planned_quantity=Decimal("10"),
                uom=self.kg,
                warehouse=self.warehouse,
                production_bin=self.production_bin,
                user=self.user,
            )

        self.assertEqual(
            ctx.exception.code,
            "BOM_COMPANY_MISMATCH",
        )


    def test_material_issue_lines_are_linked_to_bom_lines(self):
        self._available_layer(
            quantity="100",
            suffix="LINK",
        )

        order = self._production_order(quantity="10")

        released_order, material_issue, issue_lines = release_production_order(
            production_order=order,
            user=self.user,
        )

        line = material_issue.lines.get()

        self.assertIsNotNone(line.bom_line_id)
        self.assertEqual(
            line.bom_line.component_item_id,
            self.component_item.id,
        )
        self.assertEqual(
            line.material_issue.production_order_id,
            order.id,
        )
