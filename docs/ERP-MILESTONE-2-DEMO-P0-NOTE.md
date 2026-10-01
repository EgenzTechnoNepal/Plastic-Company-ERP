# EcoWrap ERP — Milestone 2 Demo P0 Implementation Note

**Status:** P0 implemented (awaiting staging verification)  
**Baseline before P0:** `d4e3837`  
**Scope:** Typed demo seed + FE cutover of commercial journey + fail-closed mock fallback

## Delivered

### Backend
- `python manage.py seed_m2_demo_chain` (+ `--full` for SO→Invoice)
- Wired into `seed_demo` (interactive inbound through AVAILABLE + landed + bill match)
- Deterministic codes: SUP-CN-PLA, CUST-A, RM-PLA-001, WH-RM, PO/GE/GRN/QC/LOT/LCD/BILL-M2-DEMO-001
- Landed example: NPR 128,000 / 100 KG = NPR 1,280/KG via real landed-cost engine
- E2E test: `apps.system.tests.test_m2_demo_e2e.Milestone2DemoE2ETests`

### Frontend
- `services/api/m2Typed.ts` — typed list adapters for suppliers, products (with balances), warehouses, bins, PO, gate, GRN, bills, SO, dispatch, invoices, QC, stock ledger
- `records.ts` routes demo entities through typed APIs
- `entityService` fail-closed for `M2_DEMO_TYPED_ENTITIES` (no silent mock stock theatre)
- QC pass/fail calls typed lot-inspections when `typedId` present
- Sales allocate / dispatch / invoice prefer typed Phase 3 APIs when typed IDs present

## Demo reset

```bash
cd Backend
python manage.py migrate
python manage.py seed_demo          # org + RBAC + DomainRecord + M2 typed inbound
# or:
python manage.py seed_m2_demo_chain
python manage.py seed_m2_demo_chain --full   # also SO→dispatch→invoice
```

## Still PARTIAL / next (P1)
- Dashboard KPIs from typed queries
- Typed create forms for PO/SO (list/view is wired; create still limited)
- CRM supplier already on typed vendor list
- Approvals decide wiring
- Production/BOM remain DomainRecord (honest PARTIAL)

## Do not claim
- Full M2 checklist complete
- Fake DomainRecord stock as truth
- Accounting GL / payroll / returns
