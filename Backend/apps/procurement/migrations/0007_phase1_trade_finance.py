# Generated manually for Phase 1 trade finance (PI + LC)

import uuid
from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.procurement.trade_finance


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0002_phase1_masters"),
        ("procurement", "0006_phase3_slice_b_commercial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProformaInvoice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("document_number", models.CharField(max_length=40)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("RECEIVED", "Received from seller"),
                            ("ACCEPTED", "Accepted"),
                            ("SUPERSEDED", "Superseded"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="DRAFT",
                        max_length=20,
                    ),
                ),
                ("seller_pi_number", models.CharField(blank=True, max_length=80)),
                ("currency_code", models.CharField(blank=True, default="USD", max_length=10)),
                ("total_amount", models.DecimalField(decimal_places=4, default=Decimal("0"), max_digits=18)),
                ("payment_terms", models.CharField(blank=True, max_length=200)),
                ("lead_time_days", models.PositiveIntegerField(blank=True, null=True)),
                ("expected_delivery_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("attachment_url", models.URLField(blank=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="proforma_invoices",
                        to="organization.company",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(app_label)s_%(class)s_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "purchase_order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="proforma_invoices",
                        to="procurement.purchaseorder",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="proforma_invoices",
                        to="procurement.supplier",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(app_label)s_%(class)s_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="LetterOfCredit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("document_number", models.CharField(max_length=40)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft (application)"),
                            ("DRAFT_LC_SCANNED", "Draft LC scanned"),
                            ("AI_MATCH_FAILED", "AI match failed"),
                            ("AI_MATCH_PASSED", "AI match passed"),
                            ("SELLER_APPROVED", "Seller approved draft"),
                            ("FINAL_ISSUED", "Final LC issued"),
                            ("MANUFACTURING", "Seller manufacturing"),
                            ("DOCS_PENDING", "Pre-dispatch docs pending"),
                            ("DOCS_CLEARED", "Pre-dispatch cleared"),
                            ("DOCS_BLOCKED", "Pre-dispatch blocked"),
                            ("CLOSED", "Closed"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="DRAFT",
                        max_length=24,
                    ),
                ),
                ("bank_name", models.CharField(blank=True, max_length=200)),
                ("lc_number", models.CharField(blank=True, help_text="Bank LC reference", max_length=80)),
                ("currency_code", models.CharField(blank=True, default="USD", max_length=10)),
                ("amount", models.DecimalField(decimal_places=4, default=Decimal("0"), max_digits=18)),
                ("expiry_date", models.DateField(blank=True, null=True)),
                ("latest_shipment_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("draft_scan_url", models.URLField(blank=True)),
                ("draft_extracted", models.JSONField(blank=True, default=dict)),
                ("match_result", models.JSONField(blank=True, default=dict)),
                ("seller_approved_at", models.DateTimeField(blank=True, null=True)),
                ("seller_approval_note", models.CharField(blank=True, max_length=255)),
                ("final_issued_at", models.DateTimeField(blank=True, null=True)),
                ("final_lc_number", models.CharField(blank=True, max_length=80)),
                (
                    "document_checklist",
                    models.JSONField(
                        blank=True,
                        default=apps.procurement.trade_finance.default_lc_document_checklist,
                    ),
                ),
                ("pre_dispatch_message", models.TextField(blank=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="letters_of_credit",
                        to="organization.company",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(app_label)s_%(class)s_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "proforma_invoice",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="letters_of_credit",
                        to="procurement.proformainvoice",
                    ),
                ),
                (
                    "purchase_order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="letters_of_credit",
                        to="procurement.purchaseorder",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="letters_of_credit",
                        to="procurement.supplier",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(app_label)s_%(class)s_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="proformainvoice",
            constraint=models.UniqueConstraint(
                fields=("company", "document_number"),
                name="uq_proforma_company_doc",
            ),
        ),
        migrations.AddConstraint(
            model_name="letterofcredit",
            constraint=models.UniqueConstraint(
                fields=("company", "document_number"),
                name="uq_lc_company_doc",
            ),
        ),
    ]
