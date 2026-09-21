"""Generate domain Record models/viewsets/urls for Phase B–I apps."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# public URL prefix, django app label, module_code, entities (frontend keys), url slugs
APPS = [
    ("crm", "crm", "crm", [
        ("customers", "customers"), ("contacts", "contacts"), ("leads", "leads"),
        ("opportunities", "opportunities"), ("activities", "activities"),
        ("dealers", "dealers"), ("territories", "territories"), ("tickets", "tickets"),
        ("quotations", "quotations"),
    ]),
    ("sales", "sales", "sales", [
        ("sales_orders", "orders"), ("deliveries", "deliveries"), ("invoices", "invoices"),
        ("payments", "payments"), ("sales_returns", "returns"), ("credit_notes", "credit-notes"),
    ]),
    ("purchase", "procurement", "procurement", [
        ("suppliers", "suppliers"), ("purchase_requisitions", "requisitions"),
        ("rfqs", "rfqs"), ("purchase_orders", "orders"), ("gate_entries", "gate-entries"),
        ("grns", "receipts"), ("purchase_bills", "bills"), ("purchase_returns", "returns"),
        ("debit_notes", "debit-notes"), ("vendor_payments", "payments"), ("ocr_bills", "ocr-bills"),
    ]),
    ("inventory", "inventory", "inventory", [
        ("products", "products"), ("batches", "batches"), ("stock_movements", "movements"),
        ("stock_adjustments", "adjustments"),
    ]),
    ("warehouse", "warehouse", "warehouse", [
        ("warehouses", "warehouses"), ("bins", "bins"), ("stock_transfers", "transfers"),
        ("bin_transfers", "bin-transfers"), ("stock_counts", "counts"),
    ]),
    ("production", "production", "production", [
        ("boms", "boms"), ("production_plans", "plans"), ("mrp_runs", "mrp"),
        ("work_orders", "orders"), ("material_issues", "issues"), ("operations", "operations"),
        ("machines", "machines"), ("machine_schedules", "schedules"),
    ]),
    ("quality", "quality", "quality", [
        ("quality_plans", "plans"), ("qc_inspections", "inspections"), ("ncrs", "ncrs"),
        ("capas", "capas"), ("instruments", "instruments"), ("certificates", "certificates"),
        ("quarantine", "quarantine"),
    ]),
    ("hr", "hr", "hr", [
        ("employees", "employees"), ("attendance", "attendance"), ("leave_requests", "leaves"),
        ("payroll_runs", "payroll-runs"), ("payslips", "payslips"),
        ("performance_reviews", "performance"), ("recruitment", "recruitment"),
    ]),
    ("accounting", "accounting", "accounting", [
        ("accounts", "accounts"), ("vouchers", "vouchers"), ("expenses", "expenses"),
        ("cost_centres", "cost-centres"), ("assets", "assets"),
    ]),
    ("workflow", "workflow", "workflow", [
        ("workflow_rules", "rules"),
    ]),
    ("notifications", "notifications", "notifications", [
        ("notifications", "notifications"),
    ]),
    ("integrations", "integrations", "integrations", [
        ("whatsapp_templates", "whatsapp-templates"), ("rfid_tags", "rfid-tags"),
        ("iot_sensors", "iot-sensors"), ("backups", "backups"),
    ]),
    ("compliance", "compliance", "compliance", [
        ("ird_submissions", "ird-submissions"), ("vat_registers", "vat-registers"),
    ]),
    ("analytics", "analytics", "analytics", [
        ("insights", "insights"),
    ]),
    ("reports", "reports", "reports", [
        ("saved_reports", "saved"),
    ]),
    ("planning", "planning", "planning", [
        ("capacity_plans", "capacity"),
    ]),
    ("payroll", "payroll", "payroll", [
        ("bank_files", "bank-files"),
    ]),
    ("documents", "documents", "documents", [
        ("attachments", "attachments"),
    ]),
]

MODELS = '''from apps.core.documents import DomainRecord


class Record(DomainRecord):
    class Meta(DomainRecord.Meta):
        abstract = False
        db_table = "{label}_record"
        verbose_name = "{label} record"
'''

VIEWS = '''from apps.core.record_api import make_record_viewset
from apps.{label}.models import Record

ENTITIES = {entities!r}
MODULE_CODE = "{module}"

VIEWSETS = {{
    entity: make_record_viewset(Record, module_code=MODULE_CODE, entity=entity)
    for entity, _slug in ENTITIES
}}
'''

URLS = '''from rest_framework.routers import DefaultRouter

from apps.{label} import views

router = DefaultRouter()
for entity, slug in views.ENTITIES:
    router.register(slug, views.VIEWSETS[entity], basename=slug)

urlpatterns = router.urls
'''

APPS_PY = '''from django.apps import AppConfig


class {class_name}Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.{label}"
    label = "{label}"
    verbose_name = "{verbose}"
'''

CLASS_NAMES = {
    "crm": "Crm", "sales": "Sales", "procurement": "Procurement", "inventory": "Inventory",
    "warehouse": "Warehouse", "production": "Production", "quality": "Quality", "hr": "Hr",
    "accounting": "Accounting", "workflow": "Workflow", "notifications": "Notifications",
    "integrations": "Integrations", "compliance": "Compliance", "analytics": "Analytics",
    "reports": "Reports", "planning": "Planning", "payroll": "Payroll", "documents": "Documents",
}

VERBOSE = {
    "crm": "CRM", "sales": "Sales", "procurement": "Procurement", "inventory": "Inventory",
    "warehouse": "Warehouse", "production": "Production", "quality": "Quality", "hr": "HR",
    "accounting": "Accounting", "workflow": "Workflow", "notifications": "Notifications",
    "integrations": "Integrations", "compliance": "Compliance", "analytics": "Analytics",
    "reports": "Reports", "planning": "Planning", "payroll": "Payroll", "documents": "Documents",
}


def main():
    for prefix, label, module, entities in APPS:
        app_dir = ROOT / "apps" / label
        app_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / "models.py").write_text(MODELS.format(label=label), encoding="utf-8")
        (app_dir / "views.py").write_text(
            VIEWS.format(label=label, module=module, entities=entities), encoding="utf-8"
        )
        (app_dir / "urls.py").write_text(URLS.format(label=label), encoding="utf-8")
        (app_dir / "apps.py").write_text(
            APPS_PY.format(label=label, class_name=CLASS_NAMES[label], verbose=VERBOSE[label]),
            encoding="utf-8",
        )
        (app_dir / "__init__.py").touch()
        (app_dir / "migrations").mkdir(exist_ok=True)
        (app_dir / "migrations" / "__init__.py").touch()
        print(f"wrote apps.{label} ({len(entities)} entities, prefix /{prefix}/)")

    api = ROOT / "config" / "api.py"
    lines = [
        '"""Aggregates the API v1 router."""',
        "",
        "from django.urls import include, path",
        "",
        "urlpatterns = [",
        '    path("auth/", include("apps.accounts.urls")),',
        '    path("organization/", include("apps.organization.urls")),',
        '    path("audit/", include("apps.audit.urls")),',
        '    path("system/", include("apps.system.urls")),',
    ]
    for prefix, label, _module, _entities in APPS:
        lines.append(f'    path("{prefix}/", include("apps.{label}.urls")),')
    lines.append("]")
    lines.append("")
    api.write_text("\n".join(lines), encoding="utf-8")
    print("updated config/api.py")


if __name__ == "__main__":
    main()
