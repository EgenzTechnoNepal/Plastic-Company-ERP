# EcoWrap ERP — Milestone 2 Client Demo Runbook

**Audience:** You (presenter) + EcoWrap client  
**Goal:** Prove contractual M2 mid-project progress with **real server-backed** stock/commercial flow  
**Do not claim:** full production/MRP, GL accounting, payroll, returns, WhatsApp/IRD as complete

---

## 0. Before the meeting (15 minutes)

### Reset staging / local demo DB

```bash
cd Backend
python manage.py migrate
python manage.py seed_demo
# Optional full outbound already posted:
# python manage.py seed_m2_demo_chain --full
```

Start backend + frontend (your usual run commands).

Confirm API login works:

| User | Password | Use for |
|------|----------|---------|
| `admin@ecowrap.com` | `admin123` | Overview + audit |
| `purchase@ecowrap.com` | `demo123` | PO / Gate / GRN / Bill |
| `qc@ecowrap.com` | `demo123` | QC inspection |
| `warehouse@ecowrap.com` | `demo123` | Locations / ledger |
| `sales@ecowrap.com` | `demo123` | CRM / SO / Invoice |
| `manager@ecowrap.com` | `demo123` | Approvals |

**Seeded typed truth (after `seed_demo`):**

| Code | Meaning |
|------|---------|
| SUP-CN-PLA | China raw material supplier |
| CUST-A / CUST-B | Demo customers |
| RM-PLA-001 | PLA 100 KG @ NPR 1,000 → landed **NPR 1,280/KG** |
| WH-RM / RECV-01 | Warehouse + receiving bin |
| PO-M2-DEMO-001 → GE → GRN → QC → AVAILABLE | Inbound chain already posted |
| BILL-M2-DEMO-001 | Supplier bill matched |

Interactive default: **stock is AVAILABLE** so you can live-demo Sales Order → Dispatch → Invoice.

---

## 1. What to say (honest framing — 2 minutes)

> “Milestone 2 is mid-project (~50%). Today we demonstrate the **real operational spine**: purchase → receive → QC → land cost → warehouse stock → sell → reserve → dispatch → invoice, with login roles and audit. Production planning, full accounting GL, and payroll are later phases — we will show UI where it exists but we will not pretend stock or books move there yet.”

---

## 2. Demo script (35–40 minutes)

### A. Login + Dashboard (3 min) — `admin@ecowrap.com`

1. Log in with API/backend (not offline mock).
2. Open **Dashboard**.
3. Point to live KPIs: customers/suppliers/items, posted GRNs, lots available, QC, open PO/SO.
4. Say: “These numbers come from the database, not hardcoded slides.”

### B. Masters (4 min) — stay admin or purchase

1. **Purchase → Suppliers** — open `SUP-CN-PLA`.
2. **CRM → Customers** — open `CUST-A` (+ contact if listed).
3. **Inventory → Products** — open `RM-PLA-001` (on-hand/available from balances).
4. **Warehouse → Warehouses / Locations** — `WH-RM`, bins.

### C. Purchase inbound proof (8 min) — `purchase@ecowrap.com`

1. **Purchase → Orders** — open `PO-M2-DEMO-001` (approved/sent/received).
2. **Gate entries** — `GE-M2-DEMO-001`.
3. **Receipts (GRN)** — `GRN-M2-DEMO-001` posted.
4. Explain: “GRN created the lot in **QC_HOLD** first — receiving is not available stock.”

### D. Quality (5 min) — `qc@ecowrap.com`

1. **Quality → Inspections** — open `QC-M2-DEMO-001` (PASSED).
2. Say: “Only after QC PASS did the lot become **AVAILABLE**. Fail would quarantine/reject — frontend cannot override that.”

### E. Landed cost + stock truth (5 min) — purchase/warehouse

1. Show landed document / cost story: purchase NPR 100,000 + extras NPR 28,000 → **NPR 1,280/KG**.
2. **Inventory → Ledger / Movements** — GRN / QC / landed / later issue lines.
3. **Products** — PLA available quantity reflects typed balances.

### F. Bill match (3 min) — purchase

1. **Purchase → Bills** — `BILL-M2-DEMO-001`.
2. Show match status from **server** 3-way match (not client-only preview).

### G. Sales outbound — LIVE (8 min) — `sales@ecowrap.com`

This is the strongest live proof if you did **not** run `--full`:

1. Create / open a **Sales Order** for `CUST-A`, item `RM-PLA-001`, qty **25 KG**, rate e.g. NPR 1,800.
2. **Allocate / Confirm** — server reserves stock (status RESERVED).
3. Pick / Pack (fulfillment flags).
4. **Dispatch / Delivery** — posts via `issue_reserved_stock` (ledger issue).
5. **Invoice** — commercial document; show print/preview.
6. Return to Dashboard — reserved qty / invoices update.

If you seeded `--full`, open the existing SO/dispatch/invoice and walk the same trail.

### H. Roles + audit (3 min)

1. Log out → login as `warehouse@ecowrap.com` — show warehouse menus.
2. `admin` → **Settings → Audit Logs** — show GRN/QC/PO/SO events.

### I. Approvals (2 min) — `manager@ecowrap.com`

1. Open **Approvals** inbox.
2. If PENDING rows exist, approve/reject; otherwise say foundation is live and used by later modules.

### J. Partial modules — show & label (3 min)

Open briefly, say **“UI / in development — not stock authority yet”**:

| Module | What to say |
|--------|-------------|
| Production / BOM / MRP | Scaffold screens — manufacturing engine is next slice |
| Accounting vouchers / statements | Not a real GL yet — commercial values exist on PO/Invoice |
| HR / Attendance / Leave / Payroll | UI only; payroll blocked on statutory rules |
| Sales/Purchase Returns | UI only — no fake stock reverse |
| CRM Leads / Quotations | DomainRecord / partial vs typed customers |

---

## 3. Proposal checklist — honest status for the client

| # | Item | Demo today | Say |
|---|------|------------|-----|
| 1 | CRM | Customers/contacts **typed**; leads/quotes partial | Working for masters |
| 2 | SO → delivery | Typed reserve + dispatch | Working on demo path |
| 3 | Tax invoice | Typed invoice | Working (IRD later) |
| 4 | Customer payment | UI only | Later |
| 5 | Sales return | UI only | Later |
| 6 | PR → RFQ → PO | PR/RFQ UI; PO typed | Partial |
| 7 | Gate + GRN | Typed | Working |
| 8 | 3-way match | Typed | Working |
| 9 | Vendor payment | UI only | Later |
| 10 | Stock ledger | Typed ledger/balances | Working |
| 11 | Warehouse bin | Typed facilities/bins | Working (ops UI deepening) |
| 12 | BOM + MRP | UI scaffold | Later |
| 13 | WO → FG | UI scaffold | Later |
| 14 | QC + NCR/CAPA | Lot QC typed; NCR/CAPA UI | Partial |
| 15 | HR | UI | Later |
| 16 | Accounting | UI not GL | Later / value summaries only |
| 17 | Roles + audit | Working | Working |
| 18 | Notifications / approvals | Approvals foundation; notifications light | Partial |

---

## 4. If something breaks

| Symptom | Fix |
|---------|-----|
| Empty lists after login | Re-run `seed_demo`; confirm JWT live mode |
| Mock/old numbers | Hard refresh; ensure not offline mode |
| Cannot allocate SO | Need AVAILABLE PLA qty — re-seed |
| QC already passed | Expected after seed; explain HOLD→PASS already done, or create new inbound later |

---

## 5. Closing line

> “This completes the Milestone 2 **operational demonstration** of integrated purchase, quality, warehouse, and sales on real transactions. Remaining proposal items — manufacturing depth, full books, HR/payroll, returns, and integrations — are scheduled for the next milestone with the same architecture.”

---

## 6. Your prep checklist

- [ ] `migrate` + `seed_demo` done  
- [ ] Backend + frontend running  
- [ ] Logged in once as each role above  
- [ ] Know PO/GRN/QC/LOT codes from section 0  
- [ ] Practice SO 25 KG live once  
- [ ] Print this runbook or keep it open during the call  
