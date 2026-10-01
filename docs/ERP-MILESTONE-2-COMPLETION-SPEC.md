# EcoWrap ERP — Contractual Milestone 2 Completion Specification

**Status:** ASSESSMENT ONLY — WAITING FOR IMPLEMENTATION APPROVAL  
**Baseline:** `7490855443fdb6bb537c4fd1aab02100ed8be7f4`  
**Repository:** https://github.com/EgenzTechnoNepal/Plastic-Company-ERP.git  
**Client:** EcoWrap Nepal Pvt. Ltd.  
**Proposal reference:** `ETN/PROP/2026/ERP-ECW-001`  
**Assessment date:** 2026-10-01  

**Do not implement production code from this document until explicitly approved.**

---

## 0. Critical distinction (locked)

| Concept | Meaning | Current baseline |
|---------|---------|------------------|
| **Internal engineering Phase 1** | Typed masters (Item, UOM, Supplier, WH/Bin, Lot, LandedCost foundation) | COMPLETE |
| **Internal engineering Phase 2** | Inbound stock engine (Gate, GRN, QC_HOLD→AVAILABLE, ledger, FIFO, reserve, putaway/transfer) | CLOSED (`f70e927`) |
| **Internal engineering Phase 3 Slice A/B** | Typed PO/SO/Dispatch/Bill/Invoice + amend/close/cancel-line + APPROVED_FOR_AP freeze | CLOSED at baseline SHA |
| **Contractual Milestone 1** | Foundation (auth, org, design / executable UI prototype stage) | Largely delivered |
| **Contractual Milestone 2** | **Core modules integrated** — live demo gate in `Backend/docs/milestone-2-checklist.md` | **NOT COMPLETE** under integrity DoD |
| **Contractual Milestone 3** | Full system + compliance / go-live (`Backend/docs/go-live-runbook.md`) | Out of this program’s primary build scope |

Internal phases describe *how* the backend was built.  
Contractual milestones describe *what* the signed proposal requires the client to accept.

**This program completes Contractual Milestone 2.** It must not silently redefine M2 as “whatever Phase 3 Slice B already shipped.”

---

## 1. Contractual source of truth used

The signed proposal PDF was **not present in the repository** at assessment time. Scope was reconstructed from proposal-linked artefacts that *are* in-repo:

| Artefact | Role |
|----------|------|
| `Backend/docs/milestone-2-checklist.md` | **Authoritative M2 gate** — 18 live-demo items (proposal p.80) |
| `Backend/docs/srs-register.md` | SRS IDs mapped to proposal §6.x / §8 modules |
| `Backend/docs/commerce-cycles.md` | Documented O2C / P2P / make / inspect / people / books cycles |
| `Backend/docs/go-live-runbook.md` | Explicitly **Milestone 3** cutover (after M2 signed) |
| `eco-craft-flow/README.md` § Development methodology | Milestones: foundation → **core modules integrated** → full system + compliance |
| `docs/ERP-PROJECT-CONTEXT.md` | Architecture locks (typed truth, DomainRecord temporary, QC ≠ Available) |

### Ambiguities (do not invent; resolve with client / proposal PDF)

1. **DomainRecord vs typed truth for M2 acceptance.** Existing SRS register marks most items “Ready for Test” based on DomainRecord CRUD. Architecture rules and this program’s DoD require **typed service-backed** truth for inventory, commercial stock moves, and eventually accounting. **Assumption for this program:** DomainRecord click-through alone is **not** M2-complete for transactional modules.
2. **Accounting depth for M2.** Checklist item 16 requires CoA + vouchers + period close. Project context Phase 6 is event-driven GL. **Assumption:** M2 needs a coherent, non-fake accounting *foundation* (typed CoA/journals or clearly labelled DomainRecord limitation + opening-balance path). Event-driven GRN/Invoice auto-posting may remain partial if accountant mapping is unsigned — must be documented, not faked.
3. **Production / MRP depth for M2.** Checklist items 12–13 require BOM + MRP + WO → issue → FG. Engineering Phase 4 is “not started.” **Assumption:** M2 requires a **minimum coherent typed production lifecycle**, not advanced finite scheduling.
4. **Payments (customer / vendor).** Checklist items 4 and 9. **Assumption:** M2 needs recorded payment documents linked to invoice/bill with outstanding updates; full bank reconciliation / IRD may be M3.
5. **WhatsApp / OCR / IRD / AI.** Present in SRS but **absent from the 18-item M2 checklist** (IRD called out as separate). **Classified M3 / credentials-gated** unless client amends scope in writing.

---

## 2. Architecture lock (non-negotiable)

```text
Frontend
  → Typed API
  → Domain Service
  → Database Transaction
  → Domain Event / Side Effect
  → Audit
  → Notifications (where applicable)
```

### Forbidden

- Business logic in React as system of record  
- JSON/`DomainRecord` as inventory, reservation, match, or GL truth  
- Fake KPI / fake stock / fake accounting statements presented as complete  
- Bypass of `StockLedgerEntry`, QC_HOLD, FIFO layers, `issue_reserved_stock()`  
- Cross-company access  
- Silent rewrite of historical BOM versions or posted commercials  

### Allowed temporarily

- DomainRecord as **list/UI compatibility** until typed cutover is finished  
- Static reference data (Incoterms catalogue, policy defaults)  
- Credential-gated stubs for WhatsApp / OCR / IRD / AI (M3)

---

## 3. Current repository reality (evidence summary)

### 3.1 What is already strong (preserve)

| Capability | Evidence | Integrity |
|------------|----------|-----------|
| JWT auth, RBAC schema, audit log, org masters | `apps/accounts`, `organization`, `audit`, `system` | Real |
| Item / UOM / Lot / ReceiptLayer / FIFO / Reserve | `apps/inventory` | Real stock |
| Gate → GRN → QC_HOLD → PASS/FAIL → AVAILABLE | `procurement/inbound*`, `quality/qc*` | Real |
| Landed cost models + post path | `inventory` landed_* | Real foundation |
| WH / Zone / Rack / Bin + putaway / transfer / adj / cycle | `warehouse` | Real ledger moves |
| Typed PO lifecycle (submit→approve→sent→close/amend/cancel-line) | `procurement/commercial`, `po_services`, Slice B | Real commercial |
| Typed SupplierBill 3-way match + APPROVED_FOR_AP freeze | `bill_services` | Real match; **no GL** |
| Typed SO → reserve → Dispatch (`issue_reserved_stock`) → Invoice | `sales/*`, Slice A/B | Real stock; **no AR/GL** |
| Company isolation on typed masters / commercial PATCH disabled | Slice B hardening | Real |
| Broad React UI surface | `eco-craft-flow` routes | UI exists; mostly DomainRecord |

### 3.2 Dual-truth risk (primary M2 failure mode)

| UI / DomainRecord path | Typed authority | Risk |
|------------------------|-----------------|------|
| `/purchase/orders/`, PR, RFQ | `/purchase/purchase-orders/` | Client can demo PO without typed PO |
| `/sales/orders/`, deliveries | `/sales/sales-orders/`, `dispatch-notes/` | Reserve/issue may never run |
| DomainRecord GRN / products.onHand | Gate/GRN/ledger/balances | Fake stock movements |
| Client `threeWayMatch` | `supplier-bills/{id}/match/` | Advisory vs authority |
| DomainRecord QC inspections | `lot-inspections` pass/fail | QC_HOLD never cleared |
| Accounting `statements/` float balances | *(none)* | Fake financials |
| Production DomainRecord BOM/MRP/WO | *(none)* | Fake manufacturing |
| Approvals inbox (mock DB) | endpoint mapped, unused | Fake multi-user approve |
| `seed_demo` DomainRecord samples | Typed tables mostly empty | Demo worlds diverge |

### 3.3 Frontend typed wiring today

- **Partial:** `phase3.ts` used from `sales/cycle.ts` / `purchase/cycle.ts` only when `typedId` / `typedBillId` present  
- **Mostly unused:** `phase2.ts` (except balances check on SO allocate)  
- **Unused by UI:** most of `phase1.ts` master paths  
- **Mock-only:** approvals inbox, notifications store, permission overrides DB  

---

## 4. Contractual M2 module completion targets

### 4.1 Administration / Core

**Contractual:** SRS-24 (Accepted), checklist #17 role login + audit.  
**Target:** COMPLETE with user/role admin API surface if missing; keep company isolation; audit on mutations.  
**M3:** Advanced backup/ops dashboards.

### 4.2 Dashboard

**Contractual:** SRS-17 role KPI dashboard; checklist implies operational visibility.  
**Target:** KPIs from typed queries (SO/PO open qty, stock balances, QC hold counts, bill match queue, invoice totals). Zero hardcoded demo numbers.  
**Not complete if:** UI still says “local store” or uses `products.onHand` as authority.

### 4.3 CRM

**Contractual:** SRS-01 (customers, contacts, leads, opportunities, activities, territories, dealers, tickets, quotations).  
**Target:** Typed Customer as truth; Contact/Address models or equivalent; activity history foundation; quotations as commercial precursor to SO (typed or controlled bridge).  
**Communication foundation:** data model / API hooks for email & WhatsApp **later** — no fake automation.  
**M3:** Live WhatsApp Business dispatch (SRS-15).

### 4.4 Sales (order-to-cash)

**Contractual:** SRS-02, checklist #2–3.  
**Target E2E (server-backed):**

```text
Customer → (Enquiry/Quotation) → Sales Order → credit warning
  → reserve_stock → pick/pack flags → DispatchNote (issue_reserved_stock)
  → SalesInvoice → Payment foundation
```

Preserve Slice A/B. Add missing enquiry/quotation/payment foundations as typed or explicit bridge.  
**Do not** fake COGS/AR journals without accounting design.

### 4.5 Sales return

**Contractual:** SRS-03, checklist #5.  
**Target:**

```text
Invoice/Dispatch → Return request → Authorisation → Inspection
  → Quarantine/Restock decision → Ledger adjustment → Credit note foundation
```

Lot/batch traceability required. Creating a return must **not** silently increase AVAILABLE stock.

### 4.6 Purchase (procure-to-pay)

**Contractual:** SRS-04, checklist #6–8.  
**Target E2E:**

```text
PR → RFQ → Supplier quotation → Compare → typed PO → Incoterm
  → Shipment → Gate → GRN → QC → Landed cost → Warehouse
  → SupplierBill → 3-way match → APPROVED_FOR_AP → Vendor payment foundation
```

Preserve Phase 2 inbound + Slice A/B PO/Bill. Implement typed or controlled PR/RFQ if contract requires (currently DomainRecord only).

### 4.7 Purchase return

**Contractual:** SRS-05, checklist implied with returns.  
**Target:** Return request → auth → inspection → return-to-supplier → stock reversal → debit note foundation. Lot traceability required.

### 4.8 Inventory

**Contractual:** SRS-06, SRS-20, checklist #10.  
**Target:** Frontend cutover to typed balances/ledger/alerts; kill DomainRecord `onHand`/`reserved` as authority; keep FIFO/reserve/landed invariants.

### 4.9 Warehouse

**Contractual:** SRS-07, checklist #11.  
**Target:** Wire putaway/transfer/adjust/cycle UI to typed `ops_services` posts. Bin hierarchy already typed.

### 4.10 Landed cost

**Contractual:** implied in P2P / inventory costing (proposal cost structure).  
**Target:** Complete posting + allocation bases (qty/weight/value/volume/equal/manual); never overwrite supplier purchase unit price; late costs as controlled adjustments.

### 4.11 Production / BOM / Planning / MRP / Machines

**Contractual:** SRS-08, SRS-09, checklist #12–13.  
**Target (minimum coherent typed lifecycle):**

```text
BOM/Formula version → Plan → MRP (real stock/PO/WO inputs)
  → Work Order → Material issue (ledger) → WIP
  → Output FG lot → QC → AVAILABLE
```

Machine/work-center master + assignment foundation.  
**Defer:** sophisticated finite-capacity scheduler if not clearly required — document as deferred.

### 4.12 Quality / NCR / CAPA

**Contractual:** SRS-10, checklist #14.  
**Target:** Wire incoming QC to typed lot inspections; typed NCR/CAPA foundation (owner, due date, root cause, closure). In-process/FG plans as needed for M2 demo.

### 4.13 Accounting

**Contractual:** SRS-13, checklist #16.  
**Target:** Honest foundation — typed CoA + journals **or** explicitly limited DomainRecord with no fake TB/P&L presented as complete. Prefer event-ready models with source document refs. Configurable tax mapping — do not invent Nepal VAT posting without accountant input (`BLOCKED BY BUSINESS RULE` where needed).  
**M3:** Full IRD/CBMS, advanced bank rec automation.

### 4.14 HRM / Attendance / Leave / Payroll

**Contractual:** SRS-11, SRS-12, checklist #15.  
**Target:** Typed employee / department / designation; attendance & leave request/approval/balance foundations; payroll only where rules are specified — else `BLOCKED BY BUSINESS RULE` with documented gaps (no fake salary engine).

### 4.15 Reports

**Contractual:** SRS-19.  
**Target:** Report endpoints/queries over typed transactional data for sales, purchase, inventory, warehouse, quality, production; accounting reports only if accounting foundation is real.

### 4.16 Notifications / Approvals

**Contractual:** checklist #18.  
**Target:** Server-backed approval inbox + notifications for document submit/approve at minimum.  
**M3:** Advanced workflow automation engine.

---

## 5. Explicit M3 / out of M2 scope

| Item | SRS / note | Classification |
|------|------------|----------------|
| Live IRD / CBMS e-billing | SRS-16; go-live runbook | **M3 / OUT OF M2 SCOPE** |
| OCR bill scanning vendor | SRS-23 | **M3 / OUT OF M2 SCOPE** (upload+manual review may remain UI) |
| WhatsApp Business automation | SRS-15 | **M3 / OUT OF M2 SCOPE** (data hooks OK in M2) |
| AI analytics gateway | SRS-14 | **M3 / OUT OF M2 SCOPE** |
| RFID / IoT device control | Integrations stubs | **M3 / OUT OF M2 SCOPE** |
| Advanced finite scheduling | Production schedules UI | **DEFER** unless proposal forces |
| Full event-driven GL auto-post every stock move | Phase 6 vision | Prefer foundation in M2; full coverage may complete in M3 |
| Generic approval matrix product | Workflow mock | Foundation in M2; advanced automation M3 |

---

## 6. Recommended internal implementation phases (execution order)

These are **implementation phases only**. They do not redefine contractual M2.

| Phase | Focus | Exit criteria |
|-------|-------|---------------|
| **A** | Contractual scope audit + architecture alignment *(this document)* | Spec + matrix approved |
| **B** | Core / masters / CRM completion | Typed CRM depth; user/role APIs if needed; dual-path plan |
| **C** | Purchase + inbound + inventory + warehouse FE cutover + PR/RFQ/returns plan | P2P demo uses typed Gate/GRN/QC/PO/Bill; stock UI uses ledger |
| **D** | Sales + returns + dispatch + invoice + payment foundation | O2C demo typed end-to-end |
| **E** | Production + BOM + planning + MRP minimum | BOM→MRP→WO→issue→output→FG QC coherent |
| **F** | Quality + NCR + CAPA typed | Lot QC wired; NCR/CAPA usable |
| **G** | Accounting foundations + reports | No fake statements; source-linked journals or explicit limitation |
| **H** | HRM + attendance + leave + payroll per signed rules | Coherent people foundation; blocked items documented |
| **I** | Dashboard + reporting + FE integration sweep | Real KPIs; mock audit classified/closed |
| **J** | E2E integration + tests + `seed_demo_data` + demo script | Gate checklist demonstrable on staging |

**Discipline:** analyse → implement one phase → test → review → commit → next. No mega-commit.

---

## 7. Demo data

Replace divergent DomainRecord-only `seed_demo` behaviour with:

```bash
python manage.py seed_demo_data   # preferred new idempotent command
```

Requirements:

- Idempotent, company-scoped, safe to re-run  
- Creates relationships via **domain services** (not raw ledger corruption)  
- Enables full M2 workflow demo on typed tables  
- Does not create impossible accounting states  

---

## 8. Testing bar for M2

### Must automate

- Unit: domain rules (state machines, tolerances, freezes)  
- API: permissions, validation, company isolation  
- Transaction: atomicity / rollback on stock and commercial posts  
- Integration: PO→GRN→QC→Landed→Stock→SO→Reserve→Dispatch→Invoice  
- Production (when in scope): BOM→MRP→WO→Issue→Output→FG  
- Negatives: wrong company, insufficient stock, QC fail, over-receipt, frozen docs, invalid transitions, concurrent stock ops  

### Must not claim complete because

- A table / API / React page exists  
- DomainRecord CRUD returns 200  
- A button triggers `setTimeout` or local mock DB  

---

## 9. Documentation deliverables (this program)

| Doc | Purpose | Status |
|-----|---------|--------|
| `docs/ERP-MILESTONE-2-COMPLETION-SPEC.md` | This assessment / program plan | **Created (assessment)** |
| `docs/ERP-MILESTONE-2-MODULE-MATRIX.md` | Module-by-module status matrix | **Created (assessment)** |
| `docs/ERP-MILESTONE-2-DEMO-SCRIPT.md` | Client demo script matching reality | After Phase J (or late I) |
| `docs/ERP-MILESTONE-2-TEST-PLAN.md` | Automated + UAT plan | During Phases C–J |

Existing `Backend/docs/milestone-2-checklist.md` remains the **client sign-off gate** and must be updated when statuses change from click-through-ready to integrity-ready.

---

## 10. Definition of Done (contractual M2 module)

A module is COMPLETE only when **all** are true:

1. Required business workflow exists end-to-end  
2. Backend domain rules enforced in services/transactions  
3. Frontend connected to authoritative APIs  
4. Permissions enforced server-side  
5. Company isolation enforced  
6. Transactions safe (no partial stock/commercial corruption)  
7. Audit/history available where required  
8. Related modules integrate correctly  
9. Automated tests cover happy + critical negative paths  
10. No known Critical/High defects on the module  
11. Documentation matches actual behaviour  

Statuses used in the matrix:

```text
COMPLETE
COMPLETE — NEEDS HARDENING
IN DEVELOPMENT
PARTIAL
NOT IMPLEMENTED
M3 / OUT OF M2 SCOPE
BLOCKED BY BUSINESS RULE
```

---

## 11. Final readiness gate (before declaring M2 complete)

- [ ] Every contractual M2 module has a documented status in the matrix  
- [ ] Critical workflows are server-backed (typed)  
- [ ] Demo uses `seed_demo_data` / typed path — not fake inventory/GL  
- [ ] Cross-module E2E works on staging  
- [ ] RBAC + company isolation tests pass  
- [ ] Inventory ledger / QC / FIFO / reservations remain correct  
- [ ] Production path coherent if included in M2 gate  
- [ ] Accounting screens do not present fake statements as complete  
- [ ] Critical automated tests green  
- [ ] Major M2 screens wired to real APIs  
- [ ] Demo script + matrix match reality  
- [ ] Client M2 checklist signed  

---

## 12. Immediate next step

Await **implementation approval** for Internal Phase B (Core / masters / CRM), after stakeholder review of:

1. This completion specification  
2. `docs/ERP-MILESTONE-2-MODULE-MATRIX.md`  
3. Explicit resolution of ambiguities in §1 (especially DomainRecord acceptance bar and accounting/production depth)

**No production code changes in this assessment step.**
