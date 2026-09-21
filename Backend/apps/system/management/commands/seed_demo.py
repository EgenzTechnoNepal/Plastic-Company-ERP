"""
python manage.py seed_demo

Creates interconnected demo data for local development: company/branch/fiscal
setup, the RBAC catalogue (modules/screens/roles/permissions) and the same
demo user accounts documented in eco-craft-flow/PROJECT_DOCS.md so the
frontend's mock login can be swapped for real JWT auth without changing
credentials.

Safe to re-run: every object is get_or_create'd. Never touches unrelated data
and never runs outside DEBUG.
"""

from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Action, Module, Role, RolePermission, User, UserRole
from apps.organization.models import Branch, Company, Department, FiscalPeriod, FiscalYear

BS_MONTH_NAMES = [
    "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush",
    "Magh", "Falgun", "Chaitra", "Baishakh", "Jestha", "Ashadh",
]

MODULES = [
    "organization", "accounts", "audit", "system",
    "crm", "sales", "procurement", "inventory", "warehouse", "production",
    "planning", "quality", "accounting", "hr", "payroll", "reports",
    "workflow", "notifications", "documents", "compliance", "integrations", "analytics",
]

ROLES = [
    ("administrator", "Administrator", True),
    ("manager", "Manager", False),
    ("sales", "Sales", False),
    ("purchase", "Purchase", False),
    ("warehouse", "Warehouse", False),
    ("production", "Production", False),
    ("hr", "HR", False),
    ("quality_control", "Quality Control", False),
    ("viewer", "Viewer", False),
]

DEMO_USERS = [
    ("admin@ecowrap.com", "admin123", "administrator", "Admin", "User"),
    ("manager@ecowrap.com", "demo123", "manager", "Rajesh", "Sharma"),
    ("sales@ecowrap.com", "demo123", "sales", "Sita", "Rai"),
    ("purchase@ecowrap.com", "demo123", "purchase", "Maya", "Shrestha"),
    ("production@ecowrap.com", "demo123", "production", "Bikash", "Thapa"),
    ("warehouse@ecowrap.com", "demo123", "warehouse", "Hari", "Karki"),
    ("qc@ecowrap.com", "demo123", "quality_control", "QC", "Lead"),
    ("hr@ecowrap.com", "demo123", "hr", "HR", "Officer"),
]


class Command(BaseCommand):
    help = "Seed interconnected demo data (organization, RBAC catalogue, demo users)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo refuses to run when DEBUG=False (production safeguard).")

        with transaction.atomic():
            company = self._seed_organization()
            role_map = self._seed_rbac()
            self._seed_users(role_map)
            self._seed_records()

        self.stdout.write(self.style.SUCCESS(f"Demo data seeded for company '{company.name}'."))

    def _seed_organization(self):
        company, _ = Company.objects.get_or_create(
            name="Ecowrap Nepal",
            defaults={
                "legal_name": "Ecowrap Nepal Pvt. Ltd.",
                "pan_vat_number": "600000000",
                "address": "Itahari-13, Nepal",
                "base_currency": "NPR",
            },
        )
        Branch.objects.get_or_create(
            company=company, code="ITH", defaults={"name": "Itahari Plant", "is_head_office": True}
        )
        Department.objects.get_or_create(company=company, code="PROD", defaults={"name": "Production"})
        Department.objects.get_or_create(company=company, code="SALES", defaults={"name": "Sales"})

        fiscal_year, _ = FiscalYear.objects.get_or_create(
            company=company, code="2082-83", defaults={"start_date": date(2025, 7, 17), "end_date": date(2026, 7, 16)}
        )
        if not fiscal_year.periods.exists():
            # Demo-only approximation: 12 roughly-equal periods spanning the fiscal year.
            # Real deployments should enter exact BS month boundaries during fiscal setup.
            cursor = fiscal_year.start_date
            for index, month_name in enumerate(BS_MONTH_NAMES, start=1):
                period_end = fiscal_year.end_date if index == 12 else cursor + timedelta(days=29)
                FiscalPeriod.objects.get_or_create(
                    fiscal_year=fiscal_year,
                    month_number=index,
                    defaults={"code": month_name, "start_date": cursor, "end_date": period_end},
                )
                cursor = period_end + timedelta(days=1)
        return company

    def _seed_rbac(self):
        module_map = {}
        for code in MODULES:
            module, _ = Module.objects.get_or_create(code=code, defaults={"name": code.replace("_", " ").title()})
            module_map[code] = module

        role_map = {}
        for code, name, is_system in ROLES:
            role, _ = Role.objects.get_or_create(code=code, defaults={"name": name, "is_system": is_system})
            role_map[code] = role

        # Administrator role gets every action on every module explicitly (in addition to the
        # is_superuser bypass) so the permission catalogue is inspectable/auditable on its own.
        admin_role = role_map["administrator"]
        for module in module_map.values():
            for action in Action.values:
                RolePermission.objects.get_or_create(
                    role=admin_role, module=module, screen=None, action=action, defaults={"is_allowed": True}
                )

        role_module_actions = {
            "manager": (list(module_map.keys()), [Action.VIEW, Action.CREATE, Action.EDIT, Action.EXPORT, Action.PRINT]),
            "sales": (["crm", "sales", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT, Action.SUBMIT]),
            "purchase": (["procurement", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT, Action.SUBMIT]),
            "warehouse": (["inventory", "warehouse", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT]),
            "production": (["production", "planning", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT]),
            "hr": (["hr", "payroll", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT]),
            "quality_control": (["quality", "reports"], [Action.VIEW, Action.CREATE, Action.EDIT]),
            "viewer": (list(module_map.keys()), [Action.VIEW]),
        }
        for role_code, (module_codes, actions) in role_module_actions.items():
            role = role_map[role_code]
            for module_code in module_codes:
                for action in actions:
                    RolePermission.objects.get_or_create(
                        role=role, module=module_map[module_code], screen=None, action=action,
                        defaults={"is_allowed": True},
                    )

        return role_map

    def _seed_users(self, role_map):
        for email, password, role_code, first_name, last_name in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=email, defaults={"first_name": first_name, "last_name": last_name}
            )
            if created:
                user.set_password(password)
                if role_code == "administrator":
                    user.is_staff = True
                    user.is_superuser = True
                user.save()
            UserRole.objects.get_or_create(user=user, role=role_map[role_code], branch=None)

    def _seed_records(self):
        from datetime import date

        from apps.crm.models import Record as CrmRecord
        from apps.sales.models import Record as SalesRecord
        from apps.procurement.models import Record as PurchaseRecord
        from apps.inventory.models import Record as InvRecord
        from apps.warehouse.models import Record as WhRecord
        from apps.production.models import Record as ProdRecord
        from apps.quality.models import Record as QcRecord
        from apps.hr.models import Record as HrRecord
        from apps.accounting.models import Record as AccRecord
        from apps.compliance.models import Record as CompRecord
        from apps.integrations.models import Record as IntRecord

        today = date.today()
        today_s = today.isoformat()
        samples = [
            (CrmRecord, "customers", "CUST-001", "Everest Mart Pvt. Ltd.", "active", {"city": "Itahari", "phone": "+977-9800000001", "creditLimit": 500000, "outstanding": 85000}),
            (CrmRecord, "leads", "LEAD-001", "Koshi Traders", "open", {"stage": "proposal", "owner": "Sita Rai", "expectedValue": 180000}),
            (CrmRecord, "quotations", "QT-001", "Everest Mart compostable bags", "approved", {"customerName": "Everest Mart Pvt. Ltd."}),
            (SalesRecord, "sales_orders", "SO-001", "Everest Mart — compostable bags", "approved", {"customerName": "Everest Mart Pvt. Ltd.", "deliveryDate": today_s}),
            (SalesRecord, "invoices", "INV-001", "Everest Mart tax invoice", "posted", {"buyerPan": "601234567", "amount": 125000}),
            (PurchaseRecord, "suppliers", "SUP-001", "PLA Resin Imports", "active", {"category": "PLA/PBAT Resin", "phone": "+977-9800000002"}),
            (PurchaseRecord, "purchase_orders", "PO-001", "PLA resin 2 MT", "approved", {"supplierName": "PLA Resin Imports"}),
            (PurchaseRecord, "grns", "GRN-001", "PLA resin inbound", "posted", {"po": "PO-001"}),
            (InvRecord, "products", "ITM-001", "Compostable carry bag 12x16", "active", {"type": "Finished Good", "onHand": 12000, "reorderLevel": 2000, "rate": 4.5}),
            (InvRecord, "batches", "BAT-001", "FG lot August", "released", {"workOrder": "WO-001", "bom": "BOM-001", "qcStatus": "Passed", "qty": 8000}),
            (InvRecord, "stock_movements", "SM-001", "GRN receipt PLA", "posted", {"item": "ITM-001", "qty": 2000, "type": "In"}),
            (WhRecord, "bins", "BIN-001", "FG-A-01", "active", {"warehouse": "WH-FG", "location": "Aisle A"}),
            (WhRecord, "stock_transfers", "TR-001", "FG to dispatch", "posted", {"fromWarehouse": "WH-FG", "toWarehouse": "WH-DISP"}),
            (ProdRecord, "boms", "BOM-001", "Carry bag 12x16", "approved", {"output": "ITM-001"}),
            (ProdRecord, "work_orders", "WO-001", "Carry bag run", "in_progress", {"bom": "BOM-001", "qty": 8000}),
            (ProdRecord, "machines", "MC-001", "Blown film line 1", "active", {"workCentre": "Extrusion"}),
            (ProdRecord, "mrp_runs", "MRP-001", "August netting", "completed", {"period": "2026-08", "suggestions": 4}),
            (QcRecord, "qc_inspections", "QC-001", "Incoming PLA", "passed", {"stage": "incoming"}),
            (QcRecord, "ncrs", "NCR-001", "Gauge drift", "open", {"severity": "minor"}),
            (HrRecord, "employees", "EMP-001", "Sita Rai", "active", {"department": "Sales", "basicSalary": 65000}),
            (HrRecord, "recruitment", "REQ-001", "Machine operator", "open", {"department": "Production", "positions": 2, "stage": "Sourcing"}),
            (HrRecord, "performance_reviews", "PERF-001", "Sita Rai FY 2082", "in_progress", {"cycle": "2082 mid-year", "managerRating": 4}),
            (HrRecord, "payroll_runs", "PAYRUN-001", "Shrawan 2082", "approved", {"period": "2082-04", "employees": 12, "net": 890000}),
            (AccRecord, "accounts", "1100", "Cash in hand", "active", {"group": "Asset", "balance": 250000}),
            (AccRecord, "accounts", "1110", "Bank — Nabil", "active", {"group": "Asset", "balance": 1800000}),
            (AccRecord, "accounts", "4000", "Sales", "active", {"group": "Income", "balance": 4200000}),
            (AccRecord, "accounts", "5000", "COGS", "active", {"group": "Expense", "balance": 2100000}),
            (AccRecord, "vouchers", "JV-001", "Opening balances", "posted", {"narration": "FY opening"}),
            (AccRecord, "assets", "AST-001", "Blown film line 1", "active", {"category": "Plant & Machinery", "cost": 8500000, "wdv": 6200000}),
            (CompRecord, "ird_submissions", "IRD-001", "INV-001", "queued", {"pan": "601234567"}),
            (IntRecord, "whatsapp_templates", "WA-001", "Dispatch notice", "active", {"channel": "whatsapp"}),
        ]
        for model, entity, code, title, status, fields in samples:
            model.objects.get_or_create(
                entity=entity,
                code=code,
                defaults={"title": title, "date": today, "status": status, "fields": fields, "lines": [], "history": [], "links": []},
            )
