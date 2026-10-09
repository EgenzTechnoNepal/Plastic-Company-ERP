"""
Production — BOM service tests.

Covers:
- BOM creation
- company isolation
- duplicate BOM codes
- BOM version integrity
- effective-date validation
- BOM line validation
- component ownership
- UOM validation
- self-component protection
- duplicate line sequences
"""

from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.inventory.models import Item, ItemType, UnitOfMeasure
from apps.organization.models import Company
from apps.production.models import BOM, BOMLine, BOMVersion
from apps.production.services import (
    BOMError,
    add_bom_line,
    create_bom,
    create_bom_version,
)


class BOMServiceTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="EcoWrap BOM",
            legal_name="EcoWrap BOM Pvt",
        )
        self.other = Company.objects.create(
            name="Other BOM",
            legal_name="Other BOM Ltd",
        )

        self.user = User.objects.create_superuser(
            email="bom@ecowrap.com",
            password="Str0ng!Passw0rd",
        )

        self.kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG",
            defaults={
                "name": "Kilogram",
                "is_base_weight": True,
            },
        )

        self.pcs, _ = UnitOfMeasure.objects.get_or_create(
            code="PCS",
            defaults={
                "name": "Pieces",
            },
        )

        self.output_item = Item.objects.create(
            company=self.company,
            sku="FG-BOM-001",
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
            sku="RM-BOM-001",
            name="Raw Material",
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

        self.other_component_item = Item.objects.create(
            company=self.other,
            sku="RM-OTHER-001",
            name="Other Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

    def _bom(self, code="BOM-001"):
        return create_bom(
            company=self.company,
            code=code,
            name="Standard Finished Product BOM",
            output_item=self.output_item,
            user=self.user,
        )

    def _bom_version(self, bom=None, version=1):
        bom = bom or self._bom()

        return create_bom_version(
            bom=bom,
            version=version,
            user=self.user,
        )

    def test_create_bom(self):
        bom = self._bom()

        self.assertEqual(bom.company_id, self.company.id)
        self.assertEqual(bom.code, "BOM-001")
        self.assertEqual(bom.name, "Standard Finished Product BOM")
        self.assertEqual(bom.output_item_id, self.output_item.id)
        self.assertEqual(bom.status, "DRAFT")

        self.assertTrue(
            BOM.objects.filter(
                company=self.company,
                code="BOM-001",
            ).exists()
        )

    def test_create_bom_rejects_cross_company_output_item(self):
        with self.assertRaises(BOMError) as ctx:
            create_bom(
                company=self.company,
                code="BOM-CROSS",
                name="Cross Company BOM",
                output_item=self.other_output_item,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "COMPANY_MISMATCH")

    def test_create_bom_rejects_duplicate_code(self):
        self._bom()

        with self.assertRaises(BOMError) as ctx:
            self._bom()

        self.assertEqual(ctx.exception.code, "DUPLICATE_CODE")

    def test_create_bom_rejects_empty_code(self):
        with self.assertRaises(BOMError) as ctx:
            create_bom(
                company=self.company,
                code="   ",
                name="Invalid BOM",
                output_item=self.output_item,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "CODE_REQUIRED")

    def test_create_bom_rejects_empty_name(self):
        with self.assertRaises(BOMError) as ctx:
            create_bom(
                company=self.company,
                code="BOM-NAME",
                name="   ",
                output_item=self.output_item,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "NAME_REQUIRED")

    def test_create_bom_version(self):
        bom = self._bom()

        version = create_bom_version(
            bom=bom,
            version=1,
            user=self.user,
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 12, 31),
            notes="Initial production version",
        )

        self.assertEqual(version.bom_id, bom.id)
        self.assertEqual(version.version, 1)
        self.assertEqual(version.status, "DRAFT")
        self.assertEqual(version.effective_from, date(2026, 1, 1))
        self.assertEqual(version.effective_to, date(2026, 12, 31))

    def test_create_bom_version_rejects_duplicate_version(self):
        bom = self._bom()

        self._bom_version(bom=bom, version=1)

        with self.assertRaises(BOMError) as ctx:
            create_bom_version(
                bom=bom,
                version=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "DUPLICATE_VERSION")

    def test_create_bom_version_rejects_invalid_version(self):
        bom = self._bom()

        with self.assertRaises(BOMError) as ctx:
            create_bom_version(
                bom=bom,
                version=0,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "INVALID_VERSION")

    def test_create_bom_version_rejects_invalid_effective_dates(self):
        bom = self._bom()

        with self.assertRaises(BOMError) as ctx:
            create_bom_version(
                bom=bom,
                version=1,
                user=self.user,
                effective_from=date(2026, 12, 31),
                effective_to=date(2026, 1, 1),
            )

        self.assertEqual(ctx.exception.code, "INVALID_EFFECTIVE_DATE")

    def test_add_bom_line(self):
        version = self._bom_version()

        line = add_bom_line(
            bom_version=version,
            component_item=self.component_item,
            quantity=Decimal("2.5"),
            uom=self.kg,
            sequence=1,
            scrap_percent=Decimal("3.5"),
            user=self.user,
        )

        self.assertEqual(line.bom_version_id, version.id)
        self.assertEqual(line.component_item_id, self.component_item.id)
        self.assertEqual(line.quantity, Decimal("2.5"))
        self.assertEqual(line.uom_id, self.kg.id)
        self.assertEqual(line.scrap_percent, Decimal("3.5"))
        self.assertEqual(line.sequence, 1)

    def test_add_bom_line_rejects_cross_company_component(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.other_component_item,
                quantity=Decimal("1"),
                uom=self.kg,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "COMPANY_MISMATCH")

    def test_add_bom_line_rejects_output_item_as_component(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.output_item,
                quantity=Decimal("1"),
                uom=self.kg,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "SELF_COMPONENT")

    def test_add_bom_line_rejects_invalid_uom(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("1"),
                uom=self.pcs,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "UOM_NOT_CONFIGURED")

    def test_add_bom_line_rejects_zero_quantity(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("0"),
                uom=self.kg,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "INVALID_QUANTITY")

    def test_add_bom_line_rejects_negative_quantity(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("-1"),
                uom=self.kg,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "INVALID_QUANTITY")

    def test_add_bom_line_rejects_negative_scrap(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("1"),
                uom=self.kg,
                sequence=1,
                scrap_percent=Decimal("-1"),
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "INVALID_SCRAP")

    def test_add_bom_line_rejects_invalid_sequence(self):
        version = self._bom_version()

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("1"),
                uom=self.kg,
                sequence=0,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "INVALID_SEQUENCE")

    def test_add_bom_line_rejects_duplicate_sequence(self):
        version = self._bom_version()

        add_bom_line(
            bom_version=version,
            component_item=self.component_item,
            quantity=Decimal("1"),
            uom=self.kg,
            sequence=1,
            user=self.user,
        )

        with self.assertRaises(BOMError) as ctx:
            add_bom_line(
                bom_version=version,
                component_item=self.component_item,
                quantity=Decimal("2"),
                uom=self.kg,
                sequence=1,
                user=self.user,
            )

        self.assertEqual(ctx.exception.code, "DUPLICATE_SEQUENCE")

    def test_multiple_bom_lines_can_use_different_sequences(self):
        second_component = Item.objects.create(
            company=self.company,
            sku="RM-BOM-002",
            name="Second Raw Material",
            item_type=ItemType.RAW_MATERIAL,
            base_uom=self.kg,
            purchase_uom=self.kg,
            stock_uom=self.kg,
            production_uom=self.kg,
            qc_required=False,
            fifo_eligible=True,
        )

        version = self._bom_version()

        line_one = add_bom_line(
            bom_version=version,
            component_item=self.component_item,
            quantity=Decimal("2"),
            uom=self.kg,
            sequence=1,
            user=self.user,
        )

        line_two = add_bom_line(
            bom_version=version,
            component_item=second_component,
            quantity=Decimal("1"),
            uom=self.kg,
            sequence=2,
            user=self.user,
        )

        self.assertEqual(line_one.sequence, 1)
        self.assertEqual(line_two.sequence, 2)
        self.assertEqual(
            BOMLine.objects.filter(bom_version=version).count(),
            2,
        )