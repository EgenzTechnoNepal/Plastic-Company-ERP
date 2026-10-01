# EcoWrap ERP — Milestone 2 Demo Readiness Specification

**Document type:** ANALYSIS + IMPLEMENTATION PLAN (no production code changed by this document)  
**Status:** WAITING FOR IMPLEMENTATION APPROVAL  
**Assessment date:** 2026-10-01  
**Repository:** https://github.com/EgenzTechnoNepal/Plastic-Company-ERP.git  
**Client:** EcoWrap Nepal Pvt. Ltd.  
**Proposal reference:** `ETN/PROP/2026/ERP-ECW-001`  

| SHA | Meaning |
|-----|---------|
| Prompt-cited baseline | `7490855443fdb6bb537c4fd1aab02100ed8be7f4` — Phase 3 Slice B final hardening |
| **Analysis HEAD** | `d4e3837e0847b254a8d6056d0c094e912bb2a306` — includes M2 assessment docs + Phase B typed CRM + ApprovalRequest |

**Delta since `7490855`:** `108c0dc` (M2 completion assessment/matrix) → `ebdcc38` (Phase B CRM/approval) → `d4e3837` (CRM tests package cleanup).

**Companions:** `docs/ERP-MILESTONE-2-COMPLETION-SPEC.md`, `docs/ERP-MILESTONE-2-MODULE-MATRIX.md`, `docs/ERP-MILESTONE-2-PHASE-B-NOTE.md`, `Backend/docs/milestone-2-checklist.md`.

**Do not implement production code from this document until explicitly approved.**

---

## 1. Executive summary

Contractual Milestone 2 is a **client live-demo gate** (~50% completion / mid-project payment), not an internal engineering phase label.

**Honest verdict at HEAD `d4e3837`:** the ERP is **not yet Milestone-2 demo-ready under typed-truth integrity**, even though substantial typed backends exist.

| Layer | Reality |
|-------|---------|
| **Backend (typed)** | Strong for masters, inbound (Gate→GRN→QC→Available→Landed), warehouse ops, FIFO/reserve, SO→Dispatch→Invoice |
| **Frontend (default path)** | Mostly DomainRecord + silent mock/localStorage fallback; typed engines largely unused by screens |
| **Seed** | Org/RBAC/users + DomainRecord samples + typed CUST-001 only — **no typed PO→Invoice chain** |
| **Demo risk** | Client can click through UI theatre without proving real stock/QC/reservation integrity |

**What must change for an honest M2 demo (P0):**

1. Deterministic typed end-to-end seed for the commercial inventory journey.  
2. Frontend cutover of that journey onto typed APIs (disable fake success / mock fallback on the demo path).  
3. Visible lots, QC state, balances/ledger, and warehouse location on real data.  
4. Dashboard/report KPIs from database queries — never hardcoded.

**What must stay deferred / labelled PARTIAL:** full production/MRP/scheduling, returns, GL/financial statements, payroll, WhatsApp/OCR/IRD/AI — unless a later approved slice builds a **minimal real** manufacturing path.

---

## 2. Signed proposal M2 requirements

### 2.1 Source of truth used

The signed proposal PDF was not in the repository. M2 requirements were reconstructed from proposal-linked artefacts:

| Artefact | Use |
|----------|-----|
| `Backend/docs/milestone-2-checklist.md` | **18-item live demo gate** (proposal p.80) |
| `Backend/docs/srs-register.md` | SRS ↔ proposal §6 / §8 module map |
| `Backend/docs/commerce-cycles.md` | O2C / P2P / make / inspect cycles |
| `Backend/docs/go-live-runbook.md` | Explicit **Milestone 3** cutover |
| `eco-craft-flow/README.md` | Foundation → **core modules integrated** → full system |
| Annexure references (B/E) | Cited in checklist/SRS artefacts as M2 acceptance / delivery register |

### 2.2 Contractual interpretation (locked for this program)

| Principle | Interpretation |
|-----------|----------------|
| M2 ≈ 50% | Demonstrable / testing-ready core modules — **not** every feature in every module |
| Live demo | Client must click through real server-backed state |
| DomainRecord click-through | **Not** sufficient for transactional stock/commercial claims |
| Checklist “Ready for Test” | Historically DomainRecord-optimistic; **re-graded** here for integrity |
| M3 boundary | IRD, OCR, WhatsApp live, AI, full GL go-live, advanced CAPA/scheduling |

### 2.3 Eighteen-item checklist (proposal gate)

| # | Item | Integrity re-grade at HEAD |
|---|------|----------------------------|
| 1 | CRM customers / leads / quotations | PARTIAL — customers/contacts/activities typed; leads/quotations DomainRecord |
| 2 | SO → pick/pack/delivery | PARTIAL — typed SO/dispatch exist; FE rarely uses them |
| 3 | Tax invoice | PARTIAL — typed SalesInvoice exists; FE DomainRecord path common |
| 4 | Customer payment | DomainRecord / not typed AR |
| 5 | Sales return / CN | DomainRecord only |
| 6 | PR → RFQ → PO | PR/RFQ DomainRecord; typed PO exists separately |
| 7 | Gate + GRN | Typed engine READY; FE unwired |
| 8 | 3-way match bill | Typed match READY; FE needs typed bill IDs |
| 9 | Vendor payment | DomainRecord / not typed AP |
| 10 | Stock ledger / reorder | Ledger typed; FE shows DomainRecord movements |
| 11 | Warehouse bin / transfer | Typed ops READY; FE DomainRecord cycles |
| 12 | BOM + MRP | DomainRecord UI only |
| 13 | WO → issue → FG | DomainRecord UI only |
| 14 | QC + NCR/CAPA | Lot QC typed; NCR/CAPA DomainRecord |
| 15 | HR / attendance / leave | DomainRecord UI only |
| 16 | Vouchers / CoA / period close | DomainRecord / float statements — **not real GL** |
| 17 | Role login + audit | READY FOR CLIENT DEMO |
| 18 | Notifications / approvals | Approvals foundation typed; notifications mock; decide path incomplete |

---

## 3. Current repository baseline

### 3.1 Accepted internal engineering (do not regress)

| Internal phase | Scope | Status |
|----------------|-------|--------|
| Phase 1 | Item/UOM, Supplier, WH/Bin, Lot, Landed foundation, currency/tax, company isolation | ACCEPTED |
| Phase 2 | Gate, GRN, QC_HOLD→AVAILABLE, ledger, FIFO, reserve, putaway/transfer/adj/cycle, integrity | ACCEPTED (`f70e927`+) |
| Phase 3 Slice A/B | Typed PO/SO/Dispatch/Bill/Invoice, 3-way match, reserved issue, lifecycle, PATCH hardening | ACCEPTED (`7490855`) |
| Phase B (M2 program) | Typed CRM Contact/Address/Activity; Customer extension; ApprovalRequest; FE CRM cutover | IMPLEMENTED at `d4e3837` — verify for demo |

### 3.2 Architecture lock (non-negotiable)

```text
React UI
  → Typed API
  → Serializer / Schema
  → Domain Service
  → Django Transaction
  → Typed Models
  → Audit
  → Domain Event
```

**Locked invariants:** immutable StockLedger; InventoryReceiptLayer; StockReservationAllocation; FIFO locking; QC_HOLD ≠ AVAILABLE; Receiving ≠ Available; `issue_reserved_stock()` for dispatch; company isolation; no second stock-issue path.

### 3.3 Dual-truth failure mode (primary demo blocker)

```text
Typed APIs (truth)          Default FE (what client clicks)
─────────────────           ──────────────────────────────
/purchase/purchase-orders/  DomainRecord /purchase/orders/
/inbound-gates|goods-receipts/  DomainRecord gate/GRN cycles
/lot-inspections/           DomainRecord qc_inspections
/inventory/.../balances     products.onHand + mock movements
/sales/sales-orders|dispatch-notes/  DomainRecord SO/delivery
/warehouse/*-v2/            DomainRecord transfers/bins
```

Silent fallback: live session DomainRecord 404/501 → mock DB (`greenflow-erp-db` localStorage). Demo looks full while typed tables stay empty.

---

## 4. Module-by-module status

**Audit codes:** A ACCEPTED/DEMO READY · B PARTIALLY READY · C UI ONLY/MOCK · D BACKEND ONLY · E NOT IMPLEMENTED · F BLOCKED BY DEPENDENCY  

**Demo vocabulary:** READY FOR CLIENT DEMO · READY AFTER HARDENING · PARTIAL / DEMO LIMITED · IN DEVELOPMENT · DEFERRED TO M3

| # | Module | Audit | Demo status | Backend | Frontend | Notes |
|---|--------|-------|-------------|---------|----------|-------|
| 1 | Dashboard | B | PARTIAL / DEMO LIMITED | No typed KPI API | Aggregates DomainRecord | Must query real balances/commercials |
| 2 | CRM | B | READY AFTER HARDENING | Customer/Contact/Address/Activity typed; leads/quotes DR | Customers/contacts/activities cut over; suppliers still DR | Enough for M2 relationship demo |
| 3 | Sales | B | READY AFTER HARDENING | SO/Dispatch/Invoice typed | DomainRecord default; phase3 only if typedId | P0 FE cutover |
| 4 | Sales Return | C | DEFERRED TO M3 / PARTIAL | None typed | DomainRecord cycles | No fake stock reverse |
| 5 | Purchase | B | READY AFTER HARDENING | PO/Gate/GRN/Bill typed | DomainRecord cycles; phase2 GRN unwired | P0 FE cutover |
| 6 | Purchase Return | C | DEFERRED TO M3 | None typed | DomainRecord | Same integrity rule as sales return |
| 7 | Inventory | B | READY AFTER HARDENING | Item/Lot/Layer/Ledger/FIFO/Reserve/Landed | DomainRecord products/movements | P0 balances/ledger screens |
| 8 | Warehouse | B | READY AFTER HARDENING | WH/Zone/Rack/Bin + putaway/transfer/adj/cycle | DomainRecord locations/transfers | P0 wire facilities/bins/ops |
| 9 | Production | C | IN DEVELOPMENT / DEFERRED | DomainRecord only | Full UI surface | Min typed slice = P1 decision |
| 10 | Production Planning | C | DEFERRED TO M3 (or P1 min) | DomainRecord | Plans UI | Depends on BOM/WO truth |
| 11 | BOM | C | IN DEVELOPMENT / DEFERRED | DomainRecord | Explosion UI | Need versioned typed BOM for honest demo |
| 12 | MRP | C | DEFERRED TO M3 | DomainRecord | MRP UI | Server netting not present |
| 13 | Machine Scheduling | C | DEFERRED TO M3 | DomainRecord | Gantt UI | No finite schedule truth |
| 14 | Quality Management | B | READY AFTER HARDENING | Lot QCInspection typed | DomainRecord inspections | P0 wire lot-inspections |
| 15 | CAPA | C | DEFERRED TO M3 | DomainRecord | UI exists | Link later to typed FAIL |
| 16 | NCR | C | DEFERRED TO M3 | DomainRecord | UI exists | Same |
| 17 | Basic Accounting | C | PARTIAL / DEMO LIMITED | DomainRecord CoA/vouchers; float statements | Looks complete | Honest value summaries only for M2 |
| 18 | Accounting / GL | E | DEFERRED TO M3 | No JournalEntry posting | Fake statements risk | No fake GL |
| 19 | Reports | B | PARTIAL / DEMO LIMITED | Sparse typed summaries | DomainRecord aggregates | P1 typed report set |
| 20 | Authentication | A | READY FOR CLIENT DEMO | JWT login/refresh/me | Live login | Seeded demo users |
| 21 | Role Management | B | READY AFTER HARDENING | Module/Role/Permission typed; enforced | Settings permissions often mock | Ops CRUD API incomplete |
| 22 | Workflow | B | READY AFTER HARDENING | ApprovalRequest + services | Inbox list typed; decide incomplete | P1 decide + seed PENDING |
| 23 | Notifications | C | PARTIAL / DEMO LIMITED | Events emit; no product inbox | Mock/localStorage | P2 event-backed inbox |
| 24 | HRM | C | PARTIAL / DEMO LIMITED | DomainRecord | Employee UI | P2 light typed employee optional |
| 25 | Attendance | C | DEFERRED TO M3 / PARTIAL | DomainRecord | Grid UI | |
| 26 | Leave | C | DEFERRED TO M3 / PARTIAL | DomainRecord | UI | |
| 27 | Payroll | F | DEFERRED TO M3 | DomainRecord; rules unsigned | Payroll UI | Blocked on SSF/TDS/salary policy |

### Adjacent

| Area | Audit | Demo status | Notes |
|------|-------|-------------|-------|
| Settings | B | READY AFTER HARDENING | Typed SystemSetting/FeatureFlag/Numbering |
| Audit Logs | A | READY FOR CLIENT DEMO | Typed AuditLog + API |
| Security | B | READY AFTER HARDENING | JWT + RBAC; do not weaken for demo |
| Backup | E / M3 | DEFERRED TO M3 | Ops/runbook later |
| Barcode | C | PARTIAL / DEMO LIMITED | Integration shell; not demo-critical |
| Landed cost | B | READY AFTER HARDENING | Post path real; FE limited — include in P0 |
| PR / RFQ | C | PARTIAL / DEMO LIMITED | Can show DomainRecord or defer; typed PO is demo authority |

---

## 5. Gap matrix

| Gap | Impact on client demo | Severity |
|-----|----------------------|----------|
| FE does not call Phase 2 Gate/GRN/QC/putaway | Stock never enters QC_HOLD→AVAILABLE on UI path | **P0 Critical** |
| FE does not post typed Dispatch/Invoice | Reservation/issue path unused | **P0 Critical** |
| `seed_demo` lacks typed commercial chain | Dual worlds; empty typed tables | **P0 Critical** |
| Silent mock fallback on 404 | Fake “success” theatre | **P0 Critical** |
| No lots UI / balances UI on typed API | Cannot prove QC or FIFO | **P0 Critical** |
| Dashboard on DomainRecord | Misleading management view | **P1 High** |
| Reports on DomainRecord | Misleading management view | **P1 High** |
| CRM suppliers still DomainRecord | Disconnect from typed PO supplier | **P1 Medium** |
| Approvals decide not typed | Inbox list vs action diverge | **P1 Medium** |
| Production/BOM/MRP DomainRecord | Manufacturing checklist items unprovable | **P1/P3** |
| Payments / returns / GL | Checklist items 4,5,9,16 unprovable as truth | **P3 / label PARTIAL** |
| Notifications mock | Checklist #18 weak | **P2** |

---

## 6. Contractual M2 mapping

| Classification | Modules / capabilities |
|----------------|------------------------|
| **MUST DEMO READY** | Auth; Audit; Item/Supplier/Customer masters; Warehouse/Bin; Purchase Order; Gate; GRN; Incoming QC (HOLD→PASS/FAIL); Landed cost post; Available stock / ledger or balances; Sales Order; Reservation; Dispatch (`issue_reserved_stock`); Sales Invoice; company isolation; role-differentiated login |
| **MUST SHOW AS PARTIAL / IN DEVELOPMENT** | CRM leads/quotations; PR/RFQ; pick/pack UI fluff; NCR/CAPA screens; Dashboard until wired; Approvals foundation; Basic accounting **value summaries** (explicitly not GL); HR employee list if DomainRecord; Production/BOM if not yet typed |
| **CAN REMAIN DEFERRED TO M3** | Full GL / TB / P&L / BS; Payroll engine; Payments/collections engine; Sales/Purchase returns engines; Finite machine scheduling; Advanced CAPA; WhatsApp; IRD; OCR; AI; RFID; IoT; advanced dealer network |

---

## 7. Demo workflow

### 7.1 Primary commercial journey (required)

```text
MASTER DATA (Item, UOM, Supplier, Customer, Warehouse, Bin)
    ↓
PURCHASE ORDER (typed)
    ↓
GATE ENTRY (typed)
    ↓
GRN POST → lot QC_HOLD (typed)
    ↓
QC INSPECTION PASS → AVAILABLE (typed)
    ↓
LANDED COST POST → layer unit cost (typed)
    ↓
PUTAWAY / BIN visibility (typed)
    ↓
INVENTORY BALANCE / LEDGER (typed)
    ↓
SALES ORDER (typed) → RESERVATION
    ↓
DISPATCH → issue_reserved_stock()
    ↓
SALES INVOICE (typed commercial freeze)
    ↓
DASHBOARD / REPORT (queries over above)
```

### 7.2 Optional manufacturing branch (only if P1 typed slice approved)

```text
BOM VERSION → PRODUCTION PLAN / WO → MATERIAL ISSUE (ledger)
→ FG OUTPUT / BATCH → FG QC → FG AVAILABLE → eligible for SO
```

If not approved: show Production UI as **PARTIAL / IN DEVELOPMENT**, do not claim stock effects.

### 7.3 Explicit non-demo paths

- DomainRecord-only convert cycles that mutate `products.onHand`  
- Client-only `threeWayMatch` without `supplier-bills/{id}/match/`  
- Accounting statements float balances  
- Fake notifications toast without persisted events  

---

## 8. Required demo dataset

Deterministic fixtures for seed command only — **never hardcode into production business logic**.

### 8.1 Organization

| Field | Value |
|-------|-------|
| Company | Ecowrap Nepal Pvt. Ltd. |
| Branch | Itahari Plant (or existing seed branch) |
| Currency | NPR |
| FY | Current seeded fiscal year |

### 8.2 Parties

| Role | Code | Name |
|------|------|------|
| Supplier | SUP-CN-PLA | China Raw Material Supplier |
| Supplier | SUP-NP-PKG | Nepal Packaging Supplier |
| Customer | CUST-A | Demo Customer A |
| Customer | CUST-B | Demo Customer B |
| Contact | — | Primary contacts on CUST-A / SUP-CN-PLA |

### 8.3 Items (examples)

| Code | Type | Description |
|------|------|-------------|
| RM-PLA-001 | Raw | PLA Raw Material (KG) |
| RM-RPL-001 | Raw | Recycled Plastic Raw Material (KG) |
| RM-MB-001 | Raw | Masterbatch (KG) |
| PKG-001 | Packaging | Packaging Material |
| FG-A-001 | Finished | Finished Product A (PCS) |
| FG-B-001 | Finished | Finished Product B (PCS) |

### 8.4 Inbound example transaction (PLA)

| Step | Quantity / value |
|------|------------------|
| PO / GRN qty | 100 KG |
| Supplier price | NPR 1,000 / KG |
| Purchase value | NPR 100,000 |
| Landed components | Freight, Insurance, Customs, Clearing, Nepal transport |
| Example landed total | NPR 128,000 → NPR 1,280 / KG |

Use the **existing landed-cost posting engine**; numbers are seed inputs only.

### 8.5 Outbound example

| Step | Intent |
|------|--------|
| SO | Sell portion of AVAILABLE PLA or FG-A to CUST-A |
| Reserve | Server reservation allocations |
| Dispatch | `issue_reserved_stock` |
| Invoice | Commercial document linked to dispatch/SO |

### 8.6 Demo users (existing pattern)

| Email | Role intent |
|-------|-------------|
| `admin@ecowrap.com` | Administrator |
| `manager@ecowrap.com` | Approvals |
| `sales@ecowrap.com` | CRM / Sales |
| `purchase@ecowrap.com` | Purchase / Gate / GRN |
| `warehouse@ecowrap.com` | Warehouse / putaway |
| `qc@ecowrap.com` | Lot inspections |

---

## 9. P0 implementation plan

**Goal:** Client can complete the §7.1 journey on staging with real DB state.

| Work item | Owner area | Detail |
|-----------|------------|--------|
| P0-1 Typed demo seed | Backend | Idempotent command/extension of `seed_demo`: masters + full PO→Invoice chain + landed + bins; refuse when `DEBUG=False` |
| P0-2 Disable demo-path fake fallback | Frontend | For demo entities, do not silently swap to mock on 404; surface errors |
| P0-3 Purchase FE cutover | Frontend | PO/Gate/GRN list+actions → typed endpoints; post GRN via Phase 2 |
| P0-4 QC FE cutover | Frontend | Lot inspections pass/fail → typed `lot-inspections` |
| P0-5 Landed cost FE | Frontend | Create/post landed document against GRN/layers |
| P0-6 Warehouse visibility | Frontend | Facilities/bins; putaway post; show lot location |
| P0-7 Inventory truth screens | Frontend | Balances + stock ledger from typed APIs (replace `products.onHand` authority) |
| P0-8 Sales FE cutover | Frontend | Create typed SO; confirm/reserve; dispatch post; invoice post |
| P0-9 Bill match demo path | Frontend | Seed typed bill; call server match / approve-for-AP |
| P0-10 E2E regression test | Backend | Single test proving §7.1 DB state transitions |

**Out of P0:** production engine, GL, returns, payroll, WhatsApp, redesign UI.

---

## 10. P1 implementation plan

| Work item | Detail |
|-----------|--------|
| P1-1 Dashboard KPI API | Available qty, QC_HOLD, quarantine, open PO/SO, reserved qty, dispatch/invoice totals — company-scoped queries |
| P1-2 Wire dashboard UI | Replace DomainRecord aggregates; drill-down links to source lists |
| P1-3 Core reports | Inventory balance, stock ledger, PO, GRN, QC status, landed cost, SO, dispatch, sales invoice, supplier/customer summaries |
| P1-4 CRM supplier cutover | FE suppliers → typed `procurement.Supplier` |
| P1-5 Approvals decide | Wire approve/reject to typed ApprovalRequest; seed PENDING demo |
| P1-6 Manufacturing decision | Either (a) minimal typed BOM→WO→issue→FG→QC slice, or (b) honest PARTIAL label with no stock claims |
| P1-7 Role/settings honesty | Reduce mock permission DB reliance for demo users |

---

## 11. P2 polish

| Work item | Detail |
|-----------|--------|
| P2-1 Notifications | Persist inbox from key domain events (PO submitted, GRN posted, QC pending/pass/fail, reserve, dispatch, invoice, approval pending) |
| P2-2 Light HR employee master | Typed employee/department if needed for checklist #15 credibility — attendance/leave may stay PARTIAL |
| P2-3 Barcode readiness note | Document shell vs production scanner integration |
| P2-4 Demo script dry-run checklist | Timing, accounts, reset procedure |
| P2-5 UX empty/loading/error | Consistent server validation toasts on cutover screens |

---

## 12. Explicit M3 deferrals

Do **not** implement for M2 demo readiness unless already essentially complete:

- WhatsApp Business live automation  
- IRD / CBMS production integration  
- OCR production integration  
- AI analytics / control tower  
- RFID / IoT  
- Full General Ledger, Trial Balance, P&L, Balance Sheet as accounting system of record  
- Full payroll (SSF/TDS) engine  
- Advanced CAPA workflows  
- Finite machine scheduling / optimization  
- Advanced dealer network / quotation engine  
- Full bank reconciliation / payment collection engine  
- Sales return / purchase return stock engines (unless separately approved as minimal real ledger reverse)  
- Generic enterprise workflow automation beyond ApprovalRequest foundation  

---

## 13. Backend changes required

| Change | Purpose | Migration? |
|--------|---------|------------|
| Extend `seed_demo` or add `seed_m2_demo_chain` | Deterministic typed journey data | No (data only) |
| Optional Dashboard summary ViewSet | Real KPIs | Unlikely / small read models only |
| Optional Report query endpoints | §10 reports | Prefer read APIs over new tables |
| Notification persistence model (P2) | Event inbox | Yes if new model |
| Minimal manufacturing models (P1 only if approved) | BOM/WO/issue/FG | Yes — substantial |
| Approval seed helpers | PENDING demo | No |
| Do **not** alter Phase 2 ledger/FIFO/QC semantics | Preserve invariants | — |

**Principle:** Prefer wiring and seeding existing services over inventing parallel engines.

---

## 14. Frontend changes required

| Change | Files / areas (likely) |
|--------|------------------------|
| Typed adapters for demo entities | `services/api/phase1.ts`, `phase2.ts`, `phase3.ts`, `records.ts`, new thin mappers if needed |
| Purchase/warehouse/quality/sales cycles | `features/purchase/cycle.ts`, `warehouse/cycle.ts`, `quality/cycle.ts`, `sales/cycle.ts` |
| Dashboard | `routes/_app.dashboard.tsx` |
| Ledger / balances / lots views | Inventory + warehouse routes; stop using DomainRecord stock authority |
| Approvals decide | `entityService` / approvals feature |
| Mock fallback policy | `createEntityService` / `records.ts` — fail closed on demo path |
| Preserve UI shell | No redesign; keep routes/design system |

---

## 15. API changes required

| API | Action |
|-----|--------|
| Existing Phase 1–3 + CRM + warehouse ops | **Use** — primary work is consumption |
| `/inventory/.../balances`, `stock-ledger` | Expose on FE |
| `/quality/lot-inspections/` (+ pass/fail actions) | Expose on FE |
| `/warehouse/putaways/…/post/`, `stock-transfers-v2`, `facilities`, `storage-bins` | Expose on FE |
| `/procurement/...` typed PO/Gate/GRN/Bill | Expose on FE |
| `/sales/...` SO/Dispatch/Invoice | Expose on FE |
| New `/dashboard/summary/` (or equivalent) | **Add** for P1 KPIs |
| New report list endpoints | **Add** as needed for P1 |
| DomainRecord routes | Remain for non-demo modules; not authority for stock |

---

## 16. Database / migration impact

| Scenario | Impact |
|----------|--------|
| P0 seed + FE cutover only | **No schema migrations required** |
| P1 dashboard/reports | Typically none (queries on existing tables) |
| P2 notifications model | One small migration |
| P1 manufacturing min slice | Multiple migrations — treat as separate approved workstream |
| Phase 2 inventory tables | **Do not modify unnecessarily** |

Demo data must **not** live in migrations.

---

## 17. Demo seed strategy

### 17.1 Requirements

- Idempotent  
- Company-scoped  
- Safe (`DEBUG=False` refuse — already on `seed_demo`)  
- Documented  
- Repeatable reset: migrate → seed → login  

### 17.2 Recommended approach

1. Keep `python manage.py seed_demo` for org/RBAC/users.  
2. Add `python manage.py seed_m2_demo_chain` (or `--with-m2-chain` flag) that:  
   - creates/updates typed masters  
   - posts deterministic inbound + QC PASS + landed  
   - creates SO → reserve → dispatch → invoice (or leaves last steps for live demo click-through — **prefer seed through AVAILABLE stock, then live SO→Invoice during demo**)  
3. Document two modes:  
   - **Reset-full:** seed completes through invoice for screenshot/regression  
   - **Reset-interactive:** seed stops at AVAILABLE + open PO template so client performs outbound live  

**Recommendation for client session:** interactive outbound (SO→Invoice live) after seeded AVAILABLE stock with known landed cost — strongest proof.

### 17.3 Verification after seed

```text
assert lot.status == AVAILABLE
assert balance.available >= seeded_qty - issued
assert ledger entries exist for GRN / QC / landed / dispatch
assert no reliance on DomainRecord products.onHand for assertions
```

---

## 18. Test strategy

| Layer | Focus |
|-------|-------|
| Unit / service | Existing Phase 2/3 services remain green |
| API | Auth, isolation, validation status codes on cutover endpoints |
| Company isolation | Cross-company blocked on CRM + commercial + stock |
| State transitions | GRN→QC_HOLD; PASS→AVAILABLE; FAIL→QUARANTINE/REJECTED |
| Ledger / reservation | Immutable ledger; dispatch via `issue_reserved_stock` only |
| **E2E M2 demo test** | PO→Gate→GRN→QC PASS→Landed→SO→Reserve→Dispatch→Invoice with DB assertions |
| Optional manufacturing E2E | Only if P1 slice built |
| Frontend | Existing `npm run build`; add smoke if repo already has FE tests — do not invent new framework |
| Regression | Full Django suite after cutover (`manage.py test`) |

---

## 19. Staging / demo readiness checklist

| Check | Requirement |
|-------|-------------|
| Git SHA | Document deployed SHA (`d4e3837`+ after implementation) |
| Backend | Migrations applied; `DEBUG` policy understood; CORS/API URL set |
| Frontend | Production build; `VITE_API_BASE_URL` → staging API |
| DB | Postgres (or project default) emptied/reset before seed |
| Seed | Org + M2 chain commands succeed |
| Health | `/api/v1/auth/login/` works for all demo users |
| Isolation | Second company cannot see Ecowrap demo docs (spot check) |
| Demo path | Mock fallback disabled or unavailable for seeded entities |
| Backup | Snapshot DB before client session (ops) |
| Script | §20 rehearsed once end-to-end |
| Known limitations slide | PARTIAL/M3 items prepared honestly |

---

## 20. Client demonstration script (30–45 minutes)

| Min | Step | Show | Classification |
|-----|------|------|----------------|
| 0–2 | Login as purchase / admin | JWT auth | WORKING NOW (today); reinforce after P0 |
| 2–5 | Dashboard | KPIs | PARTIAL today → WORKING after P1 |
| 5–8 | Masters: Item, Supplier, Customer, WH/Bin | Typed masters | WORKING (API); FE after P0 |
| 8–12 | Create/open PO | Typed PO | Backend WORKING; FE after P0 |
| 12–16 | Gate → GRN post | Lot enters **QC_HOLD** | Backend WORKING; FE after P0 |
| 16–20 | QC PASS | Lot → **AVAILABLE** | Backend WORKING; FE after P0 |
| 20–24 | Landed cost post | Unit cost NPR 1,280 example | Backend WORKING; FE after P0 |
| 24–27 | Warehouse / bin / balance | Stock location + qty | Backend WORKING; FE after P0 |
| 27–30 | Stock ledger | Immutable movements | Backend WORKING; FE after P0 |
| 30–35 | SO → reserve → dispatch → invoice | Reservation consumed | Backend WORKING; FE after P0 |
| 35–38 | Bill 3-way match (optional) | Server match | Backend WORKING; FE after P0 |
| 38–40 | Reports | Real totals | PARTIAL → P1 |
| 40–42 | CRM contact/activity | Typed CRM | WORKING NOW (Phase B) |
| 42–43 | Role switch + audit | sales vs warehouse; AuditLog | WORKING NOW |
| 43–45 | Approvals / notifications | PENDING approve | PARTIAL (foundation) |
| Close | Production / HR / Accounting | Label PARTIAL or M3 | Do not oversell |

**Script rule:** For every screen, say aloud whether the click updates **server typed state** or is still UI scaffold.

---

## 21. Known limitations (disclose to client)

1. Default UI before P0 cutover does **not** prove inventory integrity.  
2. Production/BOM/MRP/scheduling are **UI scaffolds** until a typed slice exists.  
3. Accounting screens are **not** a general ledger.  
4. Payments and returns are **not** typed stock/AR/AP engines.  
5. NCR/CAPA are record scaffolds, not closed-loop quality systems.  
6. Notifications may remain non-persistent until P2.  
7. Payroll is **blocked** on statutory policy confirmation.  
8. WhatsApp / IRD / OCR / AI are **Milestone 3 / credentials-gated**.  
9. Checklist markdown historically says “Ready for Test” — that reflected DomainRecord readiness, not typed DoD.  
10. Company isolation is enforced on typed APIs; DomainRecord routes are weaker — demo must use typed path.

---

## 22. Acceptance criteria

M2 demo readiness is accepted when **all** of the following hold on staging:

1. Seeded (or live-created) typed chain completes §7.1 without DomainRecord stock mutations.  
2. QC_HOLD is visible after GRN; AVAILABLE only after QC PASS; FAIL does not make stock available.  
3. Landed cost post updates receipt-layer cost via existing engine.  
4. SO reservation and dispatch use `issue_reserved_stock`; ledger reflects issue.  
5. Sales invoice exists as typed commercial document.  
6. Dashboard/report numbers for the demo company match DB queries (no hardcoded KPIs).  
7. Cross-company access blocked for demo documents.  
8. Role-based login works for at least admin, purchase, sales, warehouse, QC.  
9. Audit log shows key mutations.  
10. Client script (§20) completed once unaided by engineering hotfixes.  
11. PARTIAL/M3 items are verbally and visually labelled — no fake completion.  
12. Full Django regression suite green after implementation; FE build succeeds.

---

## 23. Definition of “M2 Ready”

**M2 Ready** means:

> The client can log into a staged EcoWrap ERP and complete a coherent, server-backed manufacturing **procurement → quality → warehouse → sales** demonstration that proves real transactional continuity, with management visibility from real data, while clearly labelling remaining modules as partial or Milestone 3 — sufficient to satisfy the contractual mid-project (~50%) live-demo gate without fake stock, fake accounting, or mock-only theatre on the demonstration path.

It does **not** mean every proposal line item is production-complete.

---

## Appendix A — Recommended implementation sequence (post-approval)

1. P0-1 seed M2 chain  
2. P0-2 fail-closed demo path  
3. P0-3…P0-7 inbound + QC + warehouse + balances  
4. P0-8…P0-9 outbound + bill match  
5. P0-10 E2E test + full suite  
6. P1 dashboard + reports  
7. P1 CRM supplier + approvals decide  
8. Decide manufacturing P1 vs PARTIAL  
9. P2 polish as time allows  
10. Staging checklist + script rehearsal  
11. Client demo  

## Appendix B — Files / modules likely to change (post-approval)

| Area | Likely paths |
|------|--------------|
| Seed | `Backend/apps/system/management/commands/seed_demo.py`, new seed command |
| FE API | `eco-craft-flow/src/services/api/{records,phase1,phase2,phase3,crm}.ts` |
| Cycles | `eco-craft-flow/src/features/{purchase,sales,warehouse,quality}/cycle.ts` |
| Dashboard | `eco-craft-flow/src/routes/_app.dashboard.tsx` |
| Backend KPI/reports | new `apps/.../views` under inventory/sales/procurement or `system` |
| Tests | `Backend/apps/*/tests/test_m2_demo_e2e.py` (name TBD) |
| Docs | this file + staging run notes |

## Appendix C — Biggest blockers (summary)

1. Dual truth (typed backend vs DomainRecord/mock FE)  
2. Seed without typed commercial chain  
3. No UI for lots/QC/balances truth  
4. Manufacturing/accounting checklist pressure vs honesty  
5. Historical “Ready for Test” checklist overstating DomainRecord  

---

**End of analysis document.**  
**Next step:** obtain implementation approval, then execute P0 only.
