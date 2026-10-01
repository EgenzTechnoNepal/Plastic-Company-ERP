# EcoWrap ERP — Contractual Milestone 2 Module Matrix

**Baseline:** `7490855443fdb6bb537c4fd1aab02100ed8be7f4`  
**Proposal:** `ETN/PROP/2026/ERP-ECW-001`  
**Companion:** `docs/ERP-MILESTONE-2-COMPLETION-SPEC.md`  
**Assessment date:** 2026-10-01  
**Assessment mode:** Read-only code inspection — no production code changed  

**Status legend**

| Status | Meaning |
|--------|---------|
| COMPLETE | Workflow + typed backend + FE wired + tests + DoD met |
| COMPLETE — NEEDS HARDENING | Typed authority exists; integrity/FE/tests gaps remain |
| IN DEVELOPMENT | Active typed build in progress |
| PARTIAL | Some real pieces + DomainRecord/UI scaffold |
| NOT IMPLEMENTED | Missing typed domain; DomainRecord/UI only or absent |
| M3 / OUT OF M2 SCOPE | Contractual later milestone / credentials-gated |
| BLOCKED BY BUSINESS RULE | Needs client/accountant policy before truthful implementation |

**Honesty note:** `Backend/docs/srs-register.md` currently marks many items “Ready for Test” based on DomainRecord APIs. This matrix **re-grades** for contractual M2 integrity DoD (typed service + real stock/financial semantics where claimed).

---

## 1. Executive scoreboard

| Area | Contractual refs | Overall status | Recommended phase |
|------|------------------|----------------|-------------------|
| Administration / Core | SRS-24, Checklist #17 | COMPLETE — NEEDS HARDENING | B |
| Dashboard | SRS-17 | PARTIAL | I |
| CRM | SRS-01, #1 | PARTIAL | B |
| Sales O2C | SRS-02, #2–3 | PARTIAL | D |
| Sales return / CN | SRS-03, #5 | NOT IMPLEMENTED | D |
| Customer payment | SRS-02, #4 | NOT IMPLEMENTED | D / G |
| Purchase P2P core | SRS-04, #6–8 | PARTIAL | C |
| PR / RFQ / quotes | SRS-04, #6 | NOT IMPLEMENTED | C |
| Purchase return / DN | SRS-05 | NOT IMPLEMENTED | C |
| Vendor payment | SRS-04, #9 | NOT IMPLEMENTED | C / G |
| Inventory | SRS-06, #10, SRS-20 | COMPLETE — NEEDS HARDENING | C / I |
| Warehouse | SRS-07, #11 | COMPLETE — NEEDS HARDENING | C / I |
| Landed cost | Cost structure / Phase 1–2 | COMPLETE — NEEDS HARDENING | C |
| Production / BOM / MRP | SRS-08/09, #12–13 | NOT IMPLEMENTED | E |
| Machine scheduling | SRS-08/09 | NOT IMPLEMENTED | E |
| Quality lot QC | SRS-10, #14 | COMPLETE — NEEDS HARDENING | F / C |
| NCR / CAPA | SRS-10, #14 | NOT IMPLEMENTED | F |
| Accounting | SRS-13, #16 | NOT IMPLEMENTED | G |
| HR / Leave / Attendance | SRS-11, #15 | NOT IMPLEMENTED | H |
| Payroll | SRS-12, #15 | NOT IMPLEMENTED / BLOCKED BY BUSINESS RULE | H |
| Reports | SRS-19 | PARTIAL | I |
| Approvals / Notifications | Checklist #18 | PARTIAL | B / I |
| i18n EN/NP | SRS-18 | PARTIAL | I |
| WhatsApp live | SRS-15 | M3 / OUT OF M2 SCOPE | — |
| IRD / CBMS | SRS-16 | M3 / OUT OF M2 SCOPE | — |
| OCR vendor | SRS-23 | M3 / OUT OF M2 SCOPE | — |
| AI analytics | SRS-14 | M3 / OUT OF M2 SCOPE | — |

---

## 2. Module detail matrix

### 2.1 Administration / Core

| Field | Content |
|-------|---------|
| **1. Contractual M2 requirement** | JWT auth, RBAC, organization/company isolation, audit trail, settings; role-based login demo (#17). |
| **2. Current implementation** | Custom User + Module/Role/Permission; Company/Branch/FY; AuditLog; SystemSetting/FeatureFlag/Numbering; company_scope mixin. |
| **3. Backend status** | COMPLETE — NEEDS HARDENING — Auth/RBAC/org/audit real; **no public User/Role CRUD API** (admin only). DomainRecord routes not company-scoped. |
| **4. Frontend status** | PARTIAL — Login live via JWT; Settings/permissions often mock DB; audit screen works when `source=api`. |
| **5. Integration status** | Typed views use HasModulePermission; seed_demo RBAC catalogue works. |
| **6. Tests** | `accounts/tests/*`, `organization/tests/*`, `audit/tests/*`, `inventory/tests/test_company_isolation.py`. |
| **7. Missing** | User/role management API for ops; field-permission product surface; DomainRecord company scoping. |
| **8. Technical dependencies** | None blocking. |
| **9. Recommended phase** | B |
| **10. M3 boundary** | Advanced ops monitoring, backup orchestration UI. |
| **11. Definition of done** | Ops can manage users/roles via API/UI; every typed mutation audited; isolation tests green. |

---

### 2.2 Dashboard

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-17 role KPI dashboard. |
| **2. Current** | `eco-craft-flow/src/routes/_app.dashboard.tsx` aggregates DomainRecord lists. |
| **3. Backend** | NOT IMPLEMENTED — no typed KPI/summary dashboard API (PO/SO summary endpoints exist but unused by dashboard). |
| **4. Frontend** | PARTIAL — derived KPIs from DomainRecord; “local store” wording. |
| **5. Integration** | Not connected to balances / typed commercials. |
| **6. Tests** | None for dashboard KPIs. |
| **7. Missing** | Backend KPI queries; company/date filters; permissioned KPI sets. |
| **8. Dependencies** | Typed commercial + inventory data; seed_demo_data. |
| **9. Phase** | I (after C/D truth cutover) |
| **10. M3** | AI control-tower KPIs. |
| **11. DoD** | Every KPI has backend definition + query; no fake constants. |

---

### 2.3 CRM

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-01: customers, contacts, leads, opportunities, activities, territories, dealers, tickets, quotations (#1). |
| **2. Current** | Typed `Customer` stub (`crm/models.py`); DomainRecord for remaining CRM entities; FE Customer360 on DomainRecord. |
| **3. Backend** | PARTIAL — Customer typed; Contact/Address/Activity **not typed**; dual `/crm/customers/` vs `/customer-masters/`. |
| **4. Frontend** | PARTIAL — Full CRM screens; DomainRecord live-capable; `phase1` customerMasters unused. |
| **5. Integration** | Sales typed SO uses typed Customer FK when created via API — UI often DomainRecord customer codes. |
| **6. Tests** | `crm/tests.py` DomainRecord smoke only. |
| **7. Missing** | Contacts/addresses/activities typed; quotation→SO bridge; communication hooks (email/WA ids). |
| **8. Dependencies** | Company isolation; numbering. |
| **9. Phase** | B |
| **10. M3** | Live WhatsApp/email campaign automation. |
| **11. DoD** | Customer master authoritative; related parties/history queryable; quotations feed SO without dual truth. |

---

### 2.4 Sales — Order to Cash

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-02; Checklist #2–3 (SO→pick/pack/delivery; tax invoice). |
| **2. Current** | Typed SO/Dispatch/Invoice + Slice B fulfillment flags/cancel-line/invoice cancel; DomainRecord orders/deliveries/invoices. |
| **3. Backend** | COMPLETE — NEEDS HARDENING for SO/Dispatch/Invoice; enquiry/quotation/payment **NOT IMPLEMENTED** typed. |
| **4. Frontend** | PARTIAL — Cycle calls phase3 only if typed IDs present; pick/pack DomainRecord + optional flags. |
| **5. Integration** | Reserve + `issue_reserved_stock` real when typed path used; DomainRecord path does not move stock. |
| **6. Tests** | `sales/tests/test_phase3_slice_a|b|hardening*.py`. |
| **7. Missing** | Enquiry; typed quotation; FE always creating/linking typed SO; payment foundation; COGS/AR posting. |
| **8. Dependencies** | Inventory reservations; Customer; credit policy. |
| **9. Phase** | D (FE cutover may start after C) |
| **10. M3** | IRD tax invoice queue. |
| **11. DoD** | Demo SO always typed; dispatch issues reserved stock; invoice freezes commercials; UI refresh shows server state. |

---

### 2.5 Sales Return / Credit Note

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-03; Checklist #5. |
| **2. Current** | DomainRecord returns + credit notes + FE cycle converters. |
| **3. Backend** | NOT IMPLEMENTED typed. |
| **4. Frontend** | PARTIAL UI / MOCK-ONLY authority. |
| **5. Integration** | Does not reverse ledger lots safely. |
| **6. Tests** | None for typed returns. |
| **7. Missing** | Return request, auth, inspection, quarantine/restock, credit note commercial doc. |
| **8. Dependencies** | Dispatch/Invoice links; QC; ledger adjust services. |
| **9. Phase** | D |
| **10. M3** | Auto GL reverse (with accounting). |
| **11. DoD** | Return never silently AVAILABLE-increases without inspection decision; lot traceability preserved. |

---

### 2.6 Customer Payment / AR foundation

| Field | Content |
|-------|---------|
| **1. Contractual** | Checklist #4; SRS-02 payment step. |
| **2. Current** | DomainRecord sales payments. |
| **3. Backend** | NOT IMPLEMENTED typed AR. |
| **4. Frontend** | PARTIAL DomainRecord UI. |
| **5. Integration** | Outstanding fields are JSON, not ledger. |
| **6. Tests** | None. |
| **7. Missing** | Payment allocation to invoice; outstanding calculation; AR handoff. |
| **8. Dependencies** | SalesInvoice; accounting design. |
| **9. Phase** | D / G |
| **10. M3** | Bank feed / IRD. |
| **11. DoD** | Payments update authoritative outstanding; no float fake balances. |

---

### 2.7 Purchase — PO / Gate / GRN / Bill / Match

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-04 core; Checklist #7–8. |
| **2. Current** | Typed Gate/GRN/PO/Bill + match + APPROVED_FOR_AP; ImportShipment; Incoterm. |
| **3. Backend** | COMPLETE — NEEDS HARDENING (AP/GL still scaffold). |
| **4. Frontend** | PARTIAL — DomainRecord cycles; phase3 amend/match/approve-for-ap only with typed IDs; GRN post Phase2 **unwired** in UI. |
| **5. Integration** | Typed GRN posts stock; DomainRecord GRN does not. |
| **6. Tests** | `procurement/tests/test_phase3_*`, Phase2 engine tests. |
| **7. Missing** | FE cutover; dual-path removal; payment/AP. |
| **8. Dependencies** | Inventory QC; warehouse bins. |
| **9. Phase** | C |
| **10. M3** | OCR auto-extract. |
| **11. DoD** | Demo P2P uses typed Gate→GRN→QC→Bill match; stock ledger reflects receipts. |

---

### 2.8 Purchase Requisition / RFQ / Supplier Quotation

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-04; Checklist #6. |
| **2. Current** | DomainRecord PR/RFQ + FE RfqCompare; convertRfqToPo DomainRecord. |
| **3. Backend** | NOT IMPLEMENTED typed (Slice B explicitly deferred PR/RFQ). |
| **4. Frontend** | PARTIAL DomainRecord UI. |
| **5. Integration** | Does not create typed PO unless separately bridged. |
| **6. Tests** | None typed. |
| **7. Missing** | Typed PR/RFQ/SupplierQuote + compare → typed PO. |
| **8. Dependencies** | Supplier, Item, PO services. |
| **9. Phase** | C |
| **10. M3** | Advanced sourcing analytics. |
| **11. DoD** | PR→RFQ→award produces typed PO with audit trail. |

**Ambiguity:** Engineering Slice B deferred PR/RFQ; contractual checklist includes it. Treat as **M2 required** unless client signs deferral CR.

---

### 2.9 Purchase Return / Debit Note

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-05. |
| **2. Current** | DomainRecord purchase returns / debit notes. |
| **3. Backend** | NOT IMPLEMENTED typed. |
| **4. Frontend** | PARTIAL. |
| **5. Integration** | No safe stock reversal. |
| **6. Tests** | None. |
| **7. Missing** | Return workflow + lot reverse + debit note foundation. |
| **8. Dependencies** | GRN/lots; bill; QC fail disposition. |
| **9. Phase** | C |
| **10. M3** | Auto AP reverse. |
| **11. DoD** | Lot-traced return; ledger correct; debit note commercial only until AP. |

---

### 2.10 Vendor Payment / AP foundation

| Field | Content |
|-------|---------|
| **1. Contractual** | Checklist #9. |
| **2. Current** | DomainRecord purchase payments; bill APPROVED_FOR_AP ready for Phase 6. |
| **3. Backend** | NOT IMPLEMENTED typed AP payment. |
| **4. Frontend** | PARTIAL. |
| **5. Integration** | No link from APPROVED_FOR_AP → payment allocation. |
| **6. Tests** | Bill approve tests only. |
| **7. Missing** | Vendor payment doc; allocation; outstanding. |
| **8. Dependencies** | SupplierBill; accounting. |
| **9. Phase** | C / G |
| **10. M3** | Bank/IRD. |
| **11. DoD** | Payment allocates to approved bill; status visible. |

---

### 2.11 Inventory

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-06, SRS-20; Checklist #10. |
| **2. Current** | Typed Item/UOM/Lot/Layer/Ledger/FIFO/Reserve/Landed; DomainRecord products/movements. |
| **3. Backend** | COMPLETE — NEEDS HARDENING. |
| **4. Frontend** | PARTIAL — StockLedger/alerts use DomainRecord; phase2 balances mostly unused. |
| **5. Integration** | Real when typed services used; FE warehouse cycle still mutates DomainRecord onHand. |
| **6. Tests** | Extensive `inventory/tests/*` (~99). |
| **7. Missing** | FE cutover; kill DomainRecord quantity authority; genealogy typed. |
| **8. Dependencies** | None. |
| **9. Phase** | C / I |
| **10. M3** | Advanced analytics. |
| **11. DoD** | UI ledger/balances = StockLedgerEntry/balances API; RECEIVING ≠ AVAILABLE enforced. |

---

### 2.12 Warehouse

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-07; Checklist #11. |
| **2. Current** | Typed WH hierarchy + putaway/transfer/adj/cycle; DomainRecord dual paths. |
| **3. Backend** | COMPLETE — NEEDS HARDENING. |
| **4. Frontend** | PARTIAL — cycles mutate DomainRecord; Phase2 ops APIs unwired. |
| **5. Integration** | Typed post_* mutate ledger; DomainRecord transfers do not. |
| **6. Tests** | Phase2 hardening putaway/transfer/adj. |
| **7. Missing** | FE wire to `putaways`/`stock-transfers-v2`/`cycle-counts-v2`. |
| **8. Dependencies** | Inventory layers. |
| **9. Phase** | C / I |
| **10. M3** | RFID bin scans. |
| **11. DoD** | Every stock move UI posts typed ops; bin stock matches ledger. |

---

### 2.13 Landed Cost

| Field | Content |
|-------|---------|
| **1. Contractual** | Import cost structure (freight, duty, clearing, etc.). |
| **2. Current** | LandedCostDocument/Component/Allocation + post path; purchase unit cost immutable. |
| **3. Backend** | COMPLETE — NEEDS HARDENING (late-cost UX/API polish). |
| **4. Frontend** | PARTIAL / limited screens vs DomainRecord purchase freight fields. |
| **5. Integration** | Posts into lot/layer landed_unit_cost when used. |
| **6. Tests** | Phase1/2 landed tests. |
| **7. Missing** | Full FE for components/bases; demo seed path. |
| **8. Dependencies** | GRN/currency. |
| **9. Phase** | C |
| **10. M3** | Auto from OCR invoice. |
| **11. DoD** | Allocation bases work; audit; no overwrite of supplier purchase price. |

---

### 2.14 Production / BOM / Planning / MRP

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-08/09; Checklist #12–13. |
| **2. Current** | DomainRecord only (`production` app Record); FE BOM explode/MRP client algorithms. |
| **3. Backend** | NOT IMPLEMENTED. |
| **4. Frontend** | MOCK-ONLY authority (rich UI). |
| **5. Integration** | No ledger issue/output. |
| **6. Tests** | DomainRecord genealogy smoke only. |
| **7. Missing** | Entire typed BOM versioning, WO, issue, WIP, output, scrap, MRP engine. |
| **8. Dependencies** | Inventory; Item; Warehouse; QC for FG. |
| **9. Phase** | E |
| **10. M3** | Advanced APS / finite capacity. |
| **11. DoD** | BOM version immutable once used; MRP uses real on-hand/reserve/PO/WO; issue/output hit ledger. |

**Ambiguity:** Large build. Required by M2 checklist — schedule as Phase E with thin but real lifecycle, not UI simulation.

---

### 2.15 Machine Scheduling

| Field | Content |
|-------|---------|
| **1. Contractual** | Shop-floor machines/schedules (SRS-08/09). |
| **2. Current** | DomainRecord machines/schedules + Gantt UI. |
| **3. Backend** | NOT IMPLEMENTED typed. |
| **4. Frontend** | MOCK-ONLY. |
| **5. Integration** | None. |
| **6. Tests** | None. |
| **7. Missing** | Work center master, availability, WO assignment, start/stop foundation. |
| **8. Dependencies** | WO. |
| **9. Phase** | E |
| **10. M3** | Finite scheduler / IoT. |
| **11. DoD** | Assignment records exist; deferred advanced scheduling documented. |

---

### 2.16 Quality — Lot Inspection

| Field | Content |
|-------|---------|
| **1. Contractual** | Incoming QC in SRS-10 / #14; architecture QC_HOLD gate. |
| **2. Current** | Typed `QCInspection` pass/fail → lot status; DomainRecord inspections UI separate. |
| **3. Backend** | COMPLETE — NEEDS HARDENING. |
| **4. Frontend** | PARTIAL — DomainRecord QC; phase2 lotInspections **unused**. |
| **5. Integration** | Typed path correct; FE path bypasses truth. |
| **6. Tests** | Phase2 QC tests. |
| **7. Missing** | FE wire; in-process/FG typed plans as needed. |
| **8. Dependencies** | GRN lots. |
| **9. Phase** | F / C |
| **10. M3** | Lab instruments integration. |
| **11. DoD** | Demo QC always typed lot inspection; AVAILABLE only after PASS. |

---

### 2.17 NCR / CAPA

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-10; Checklist #14. |
| **2. Current** | DomainRecord NCR/CAPA. |
| **3. Backend** | NOT IMPLEMENTED typed. |
| **4. Frontend** | PARTIAL UI. |
| **5. Integration** | Not linked to lot fail events. |
| **6. Tests** | None. |
| **7. Missing** | Typed NCR/CAPA with owner, due date, root cause, evidence, closure; link from QC FAIL. |
| **8. Dependencies** | QCInspection. |
| **9. Phase** | F |
| **10. M3** | Advanced QMS automation. |
| **11. DoD** | FAIL can open NCR; CAPA closable with audit. |

---

### 2.18 Accounting

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-13; Checklist #16. |
| **2. Current** | DomainRecord CoA/vouchers; `StatementsView` aggregates JSON balances with **float**. |
| **3. Backend** | NOT IMPLEMENTED (scaffold). |
| **4. Frontend** | PARTIAL — looks complete; financially fake. |
| **5. Integration** | Bill/Invoice do not post journals. |
| **6. Tests** | None. |
| **7. Missing** | Typed ChartOfAccounts, JournalEntry/Lines, posting rules, TB/P&L/BS from journals. |
| **8. Dependencies** | Client chart + tax mapping — may be **BLOCKED BY BUSINESS RULE** for VAT detail. |
| **9. Phase** | G |
| **10. M3** | IRD, bank feed, full automation. |
| **11. DoD** | No screen claims COMPLETE TB/P&L without journal truth; source refs on every posting. |

---

### 2.19 HRM / Attendance / Leave

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-11; Checklist #15. |
| **2. Current** | DomainRecord employees/attendance/leaves/recruitment/performance. |
| **3. Backend** | NOT IMPLEMENTED typed. |
| **4. Frontend** | PARTIAL; departments often seed-only (`RECORD_PATHS` gap). |
| **5. Integration** | Approvals mock. |
| **6. Tests** | None. |
| **7. Missing** | Typed employee/dept/designation; attendance; leave types/requests/balances. |
| **8. Dependencies** | Org Branch/Department; approval foundation. |
| **9. Phase** | H |
| **10. M3** | Biometric devices. |
| **11. DoD** | Core people workflow server-backed; permissions enforced. |

---

### 2.20 Payroll

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-12. |
| **2. Current** | DomainRecord payroll runs/payslips; FE creates runs locally. |
| **3. Backend** | NOT IMPLEMENTED / **BLOCKED BY BUSINESS RULE** (SSF/TDS/salary rules not locked in code). |
| **4. Frontend** | PARTIAL. |
| **5. Integration** | No GL salary journals. |
| **6. Tests** | None. |
| **7. Missing** | Defined pay components, statutory rules, payslip generation. |
| **8. Dependencies** | Client payroll policy sign-off. |
| **9. Phase** | H |
| **10. M3** | Bank file automation refinements. |
| **11. DoD** | Only implement calculations with signed rules; otherwise document blocked. |

---

### 2.21 Reports

| Field | Content |
|-------|---------|
| **1. Contractual** | SRS-19. |
| **2. Current** | FE aggregates DomainRecord; DomainRecord saved_reports. |
| **3. Backend** | NOT IMPLEMENTED typed report queries. |
| **4. Frontend** | PARTIAL. |
| **5. Integration** | Reflects DomainRecord world. |
| **6. Tests** | None. |
| **7. Missing** | Report APIs over typed tables; export. |
| **8. Dependencies** | Module truth cutovers. |
| **9. Phase** | I |
| **10. M3** | Scheduled email/AI insights. |
| **11. DoD** | Reports match ledger/commercial truths. |

---

### 2.22 Approvals / Notifications

| Field | Content |
|-------|---------|
| **1. Contractual** | Checklist #18. |
| **2. Current** | FE mock approvals DB; DomainRecord workflow_rules; notifications mock. |
| **3. Backend** | PARTIAL — endpoints mapped; not productized typed approval engine. |
| **4. Frontend** | MOCK-ONLY inbox. |
| **5. Integration** | Document submit/approve may hit DomainRecord workflow, not shared inbox. |
| **6. Tests** | Limited. |
| **7. Missing** | Server approval requests; notification persistence; wire FE. |
| **8. Dependencies** | Auth users/roles. |
| **9. Phase** | B / I |
| **10. M3** | Advanced matrix engine / WhatsApp notify. |
| **11. DoD** | Multi-user approve visible in inbox; not localStorage-only. |

---

### 2.23 DomainRecord compatibility layer

| Field | Content |
|-------|---------|
| **1. Contractual** | Not a deliverable — temporary adapter. |
| **2. Current** | Widespread Record models + `record_api`. |
| **3. Backend** | COMPLETE as adapter; **dangerous as truth**. |
| **4. Frontend** | Primary data path for most screens. |
| **5. Integration** | Parallel to typed APIs. |
| **6. Tests** | Isolation test keeps DomainRecord routes registered. |
| **7. Missing** | Cutover plan per entity; company scope. |
| **8. Dependencies** | Typed replacements. |
| **9. Phase** | Continuous B–I |
| **10. M3** | Remove dead DomainRecord entities. |
| **11. DoD** | Transactional entities no longer authoritative on DomainRecord. |

---

### 2.24 Demo seed

| Field | Content |
|-------|---------|
| **1. Contractual** | Needed for M2 live demo gate. |
| **2. Current** | `seed_demo` — org/RBAC + DomainRecord samples; refuses non-DEBUG. |
| **3. Backend** | PARTIAL — does not seed typed stock/commercial world. |
| **4. Frontend** | Mock seed when offline. |
| **5. Integration** | Divergent demo worlds. |
| **6. Tests** | None for seed_demo. |
| **7. Missing** | Idempotent `seed_demo_data` via domain services. |
| **8. Dependencies** | Typed modules. |
| **9. Phase** | J (build incrementally from C) |
| **10. M3** | Production opening balances loaders. |
| **11. DoD** | One command demos full M2 typed workflow. |

---

## 3. M2 checklist (proposal p.80) — integrity re-grade

| # | Checklist item | Prior doc status | Integrity re-grade | Gap summary |
|---|----------------|------------------|--------------------|-------------|
| 1 | CRM customers / leads / quotations | Ready for Test | PARTIAL | Typed Customer only; rest DomainRecord |
| 2 | SO → pick/pack/delivery | Ready for Test | PARTIAL | Typed SO/Dispatch exist; FE dual-path |
| 3 | Tax invoice | Ready for Test | PARTIAL | Typed SalesInvoice; IRD M3 |
| 4 | Customer payment | Ready for Test | NOT IMPLEMENTED | DomainRecord only |
| 5 | Sales return / credit note | Ready for Test | NOT IMPLEMENTED | DomainRecord only |
| 6 | PR → RFQ → PO | Ready for Test | PARTIAL | PR/RFQ DomainRecord; PO typed |
| 7 | Gate + GRN | Ready for Test | PARTIAL | Typed engine real; FE DomainRecord |
| 8 | 3-way match bill | Ready for Test | PARTIAL | Server match real; FE often advisory |
| 9 | Vendor payment | Ready for Test | NOT IMPLEMENTED | DomainRecord only |
| 10 | Stock ledger / reorder | Ready for Test | PARTIAL | Ledger real; FE DomainRecord |
| 11 | Warehouse bin / transfer | Ready for Test | PARTIAL | Typed ops real; FE DomainRecord |
| 12 | BOM + MRP | Ready for Test | NOT IMPLEMENTED | Client simulation |
| 13 | WO → issue → FG | Ready for Test | NOT IMPLEMENTED | DomainRecord |
| 14 | QC + NCR/CAPA | Ready for Test | PARTIAL | Lot QC real; NCR/CAPA DomainRecord |
| 15 | HR attendance leave | Ready for Test | NOT IMPLEMENTED | DomainRecord |
| 16 | Vouchers + CoA + period close | Ready for Test | NOT IMPLEMENTED | Fake statements risk |
| 17 | Role login + audit | Ready for Test | COMPLETE — NEEDS HARDENING | Auth/audit real |
| 18 | Notifications / approvals | Ready for Test | PARTIAL | Mock inbox |

**Gate condition note:** “≥50% SRS Ready for Test” in checklist is **not** equivalent to integrity COMPLETE. This program targets integrity DoD before client sign-off.

---

## 4. Frontend mock audit (summary classification)

| Finding | Paths (representative) | Classification |
|---------|------------------------|----------------|
| Offline mock DB + seed | `services/mock/db.ts`, `seed.ts`, `seed-bulk.ts` | ACCEPTABLE STATIC offline; REPLACE WITH REAL API for demo authority |
| Orphan `features/*/mock.ts` | crm/sales/purchase/… | REMOVE |
| DomainRecord hybrid CRUD | `services/api/records.ts`, `entityService.ts` | REPLACE WITH REAL API where typed exists |
| Phase2 APIs unused in cycles | `phase2.ts` vs warehouse/quality/purchase cycles | REPLACE WITH REAL API |
| Phase3 partial typedId bridging | `sales/cycle.ts`, `purchase/cycle.ts` | REPLACE WITH REAL API (always link typed docs) |
| Approvals/notifications mock | `workflow/approvals.ts`, entityService hooks | REPLACE WITH REAL API |
| OCR/RFID/IoT stubs | purchase/ocr, integrations/* | DEFERRED / M3 |
| Form placeholders | forms/definitions | VALID UI PLACEHOLDER |
| Policy constants (tolerance, labour rate) | cycle.ts | ACCEPTABLE STATIC until config API |

---

## 5. Recommended build sequence (dependency graph)

```text
Phase A (done: this assessment)
    ↓
Phase B — Core/CRM/Approvals foundation
    ↓
Phase C — Purchase inbound FE cutover + PR/RFQ/returns + inventory/WH UI truth
    ↓
Phase D — Sales FE cutover + returns + payments foundation
    ↓
Phase E — Production/BOM/MRP/WO minimum
    ↓
Phase F — NCR/CAPA + QC UI wire
    ↓
Phase G — Accounting foundation (honest)
    ↓
Phase H — HR/Leave/Attendance/(Payroll if unblocked)
    ↓
Phase I — Dashboard/Reports/FE sweep
    ↓
Phase J — seed_demo_data + E2E tests + demo script + checklist update
```

---

## 6. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Treating DomainRecord “Ready for Test” as M2 done | Client demo without inventory integrity | Integrity re-grade; dual-path kill list |
| Fake accounting statements | Legal/finance distrust | Hide or rebuild before demo |
| Production scope explosion | Miss M2 date | Thin typed lifecycle first; defer APS |
| Payroll rules unspecified | Wrong payslips | BLOCKED BY BUSINESS RULE until signed |
| seed_demo divergence | Demo fails on typed UI | New seed_demo_data |
| Parallel URL confusion | Support burden | Registry + adapters prefer typed |

---

## 7. What must not be rebuilt

Preserve accepted work:

- Phase 1 masters & company isolation  
- Phase 2 ledger / FIFO / reserve / QC_HOLD / putaway / transfer / landed post  
- Phase 3 Slice A/B commercial docs, `issue_reserved_stock`, 3-way match, PATCH disable hardening  
- Existing React navigation/screens (wire, don’t redesign)  

---

## 8. Approval ask

Approve this matrix and `ERP-MILESTONE-2-COMPLETION-SPEC.md`, then authorize **Internal Phase B** implementation (no M3 features, no emergency demo shortcuts).
