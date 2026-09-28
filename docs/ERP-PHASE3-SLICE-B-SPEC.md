# EcoWrap ERP — Phase 3 Slice B Specification

**Status:** ANALYSIS ONLY — WAITING FOR IMPLEMENTATION APPROVAL  
**Baseline (accepted Phase 3 Slice A):** `2d36abbbd8bcd0b761713821c4a8889a0d96fdf7`  
**Repository:** https://github.com/EgenzTechnoNepal/Plastic-Company-ERP.git  
**Date:** 2026-09-28  

**Phase 1 ACCEPTED · Phase 2 CLOSED · Phase 3 Slice A ACCEPTED / CLOSED**

Do **not** reopen Phase 1, Phase 2, or Slice A integrity architecture.  
Do **not** implement code, migrations, or frontend changes from this document until explicitly approved.

---

## 1. Current repository state

### 1.1 Authoritative layers (after Slice A)

| Layer | Truth |
|-------|--------|
| Masters (Item, UOM, Supplier, Customer, WH/Bin, Currency, Tax, Incoterm, Lot, ReceiptLayer, SupplierItemPrice) | Typed Django (Phase 1) |
| Inbound physical stock (Gate, GRN, QC, Ledger, FIFO, Reserve, Putaway, Transfer, Adjust, Landed) | Typed Phase 2 |
| Commercial core (PO, SO, Dispatch, SupplierBill, SalesInvoice) | **Typed Slice A** |
| Reservation issue path | `issue_reserved_stock()` + `StockReservationAllocation` |
| 3-way match | Server line-level `MATCHED` / `TOLERANCE_MATCHED` / `MISMATCHED` |
| PR, RFQ, quotations, payments, returns, credit/debit notes, pick/pack docs | **DomainRecord + mock UI only** |
| Approvals matrix | Frontend mock (`features/workflow/approvals.ts`) — no typed engine |
| Accounting / GL / AP / AR | DomainRecord scaffold — **Phase 6** |

### 1.2 Apps / packages inspected

| Area | Findings |
|------|----------|
| `Backend/apps/procurement/` | Typed `Supplier`, `Incoterm`, `SupplierDocument`; Phase 2 inbound; Slice A `commercial.py`, `po_services`, `bill_services`, `phase3_views`, hardening tests |
| `Backend/apps/sales/` | Slice A `commercial.py`, `so_services`, `dispatch_services`, `invoice_services`, `phase3_views`; DomainRecord `Record` remains |
| `Backend/apps/inventory/` | Phase 1–2 + `reserved_issue.py`; `SupplierItemPrice` exists; **no** `CustomerItemPrice` |
| `Backend/apps/warehouse/` | Putaway/transfer/adjust/cycle count typed; **no** picking/packing models |
| `Backend/apps/quality/` | Typed `QCInspection` only |
| `Backend/apps/core/` | `phase3_policy.py`, events (Slice A names), numbering, `DocumentModel` abstract (unused by Slice A commercial) |
| `Backend/apps/workflow/` | DomainRecord only |
| `Backend/apps/documents/` | DomainRecord only |
| `Backend/apps/accounting/` | DomainRecord only |
| `eco-craft-flow/src/features/purchase/` | Full mock cycle: PR→RFQ→PO amend→gate→GRN→bill; OCR/IRD panels |
| `eco-craft-flow/src/features/sales/` | Mock fulfill allocate/pick/pack; returns→credit note |
| `eco-craft-flow/src/services/api/phase3.ts` | Path adapters exist; screens still mostly DomainRecord |

### 1.3 Files inspected (representative)

- `docs/ERP-PROJECT-CONTEXT.md`, `docs/ERP-PHASE3-SPEC.md`, `docs/ERP-PHASE3-SLICE-A-IMPLEMENTATION.md`
- `Backend/apps/procurement/commercial.py`, `po_services.py`, `bill_services.py`, `inbound_services.py`, `models.py`, `urls.py`, `phase3_views.py`, tests
- `Backend/apps/sales/commercial.py`, `so_services.py`, `dispatch_services.py`, `invoice_services.py`, `phase3_views.py`, tests
- `Backend/apps/inventory/reserved_issue.py`, `models.py` (`SupplierItemPrice`), `stock_services.py`
- `Backend/apps/core/phase3_policy.py`, `events.py`, `models.py` (`DocumentModel`)
- `Backend/apps/crm/models.py` (`Customer.credit_limit`, `payment_terms`)
- `Backend/apps/organization/models.py` (`Currency`, `ExchangeRate`, `TaxRate`)
- `eco-craft-flow/src/features/purchase/cycle.ts`, `RfqCompare.tsx`, `CycleActions.tsx`
- `eco-craft-flow/src/features/sales/cycle.ts`, `FulfillmentPanel.tsx`, `FulfillmentQueue.tsx`
- `eco-craft-flow/src/services/api/phase3.ts`, `phase2.ts`
- `eco-craft-flow/src/routes/_app.warehouse.picking.tsx`, packing route, registry entities

### 1.4 Slice A capabilities already accepted (do not rebuild)

**Procurement**

- `PurchaseOrder` / `PurchaseOrderLine` + submit/approve/cancel
- PO → Gate / ImportShipment / GRN line FKs
- Receipt progress + 2% over-receipt tolerance
- `SupplierBill` / lines + server line-level 3-way match
- Non-PO GRN still allowed

**Sales**

- `SalesOrder` / lines + confirm → `reserve_stock` + allocations
- Cancel / release reservations
- `DispatchNote` → `issue_reserved_stock()` → ISSUE ledger
- `SalesInvoice` commercial post (requires posted dispatch)
- Hardening: reserved-issue integrity, PO/GRN linkage, match semantics, dispatch/invoice checks

**Preserved Phase 2**

- Immutable `StockLedgerEntry`, FIFO, QC_HOLD, reservations, landed cost, WH ops, company isolation

---

## 2. Remaining gaps (evidence-based)

### 2.1 Typed functionality missing

| Gap | Evidence |
|-----|----------|
| PO mark SENT / CLOSE / reopen services | Status enum exists; no service/API actions beyond submit/approve/cancel |
| PO line cancel remaining (`cancelled_quantity`) | Field exists; no cancel-line service |
| PO amendment after approve | Only DomainRecord `amendPurchaseOrder()` copy |
| SupplierBill `APPROVED_FOR_AP` / discount / FX freeze | Match + post only; Phase 3 spec foresaw APPROVED_FOR_AP |
| SO promised delivery / pick-pack flags | DomainRecord fields only; typed SO has `requested_delivery_date` only |
| SO line cancel / partial cancel | Cancel whole SO only |
| Customer price list | `SupplierItemPrice` exists; no customer equivalent |
| Credit / debit notes | DomainRecord + mock converters only |
| Returns (sales/purchase) | DomainRecord / `features/extended/mock.ts` only |
| Typed PR / RFQ / SupplierQuote | DomainRecord entities + mock cycle only |
| Separate Pick / Pack / Delivery docs | Warehouse routes wrap sales fulfillment UI; no backend models |
| Document attachments on PO/SO/Bill/Invoice | `SupplierDocument` only on Supplier |
| Generic approval engine | Frontend mock rules; `workflow` DomainRecord |
| Reporting aggregates | No commercial summary APIs |

### 2.2 DomainRecord compatibility (still UI authority for lists)

Entity keys: `purchase_requisitions`, `rfqs`, `purchase_orders`, `sales_orders`, `deliveries`, `invoices`, `purchase_bills`, `sales_returns`, `purchase_returns`, `credit_notes`, `debit_notes`, `payments`, …

### 2.3 Frontend-only / mock

- PR→RFQ→vendor select→PO, PO amendment as new record  
- Pick/pack status toggles (now advisory; allocate may call typed confirm if `typedId` set)  
- Client `threeWayMatch` preview (already demoted)  
- OCR / IRD / WhatsApp shells  
- Approval inbox / matrix  

### 2.4 What EcoWrap operational path needs next

EcoWrap’s locked physical path is already runnable:

```text
PO → Gate → GRN → QC → Available → (reserve) SO → Dispatch → Invoice
+ SupplierBill match
```

Slice B should close **commercial lifecycle holes** that block daily ops and Phase 6 handoff — not invent a second ERP.

---

## 3. EcoWrap business workflow (target after Slice B)

```text
(Optional DomainRecord PR/RFQ) ──┐
                                 ▼
Supplier / price list ──► typed PO ──► SENT ──► receive (Phase 2) ──► close lines/PO
                                 │
                                 └──► SupplierBill match ──► APPROVED_FOR_AP ──► Phase 6 AP

Customer / price ──► typed SO ──► confirm/reserve ──► [pick/pack flags] ──► Dispatch
                                                              │
                                                              └──► SalesInvoice ──► Phase 6 AR
```

Returns / credit notes / payments remain later phases unless promoted below.

---

## 4. MUST HAVE (Slice B minimum)

Operational completion of typed commercial docs **without** returns, PR/RFQ engine, or separate pick documents.

### M1. PO lifecycle completion

| # | Feature | Why |
|---|---------|-----|
| M1.1 | `mark_po_sent` | Status already in state machine; needed after approve before receive |
| M1.2 | `close_purchase_order` / line close | Under-receipt finalize; stop further receipts |
| M1.3 | `cancel_po_line` (remaining qty → `cancelled_quantity`) | Partial cancel without killing whole PO |
| M1.4 | Controlled `amend_purchase_order` | Change expected delivery / notes anytime (if not CLOSED); change open qty/price **only if line received=0**; never silent edit after bill matched |

### M2. SO lifecycle completion

| # | Feature | Why |
|---|---------|-----|
| M2.1 | `cancel_so_line` + release that line’s reservations | Partial order change without full cancel |
| M2.2 | `promised_delivery_date` on SO | Ops planning (distinct from requested) |
| M2.3 | Operational flags `pick_status` / `pack_status` on SO (or Dispatch) | Keep UI fulfillment; **not** new stock documents |
| M2.4 | Default price helper from price masters when adding lines | Reduce wrong manual prices |

### M3. SupplierBill Phase 6 handoff prep

| # | Feature | Why |
|---|---------|-----|
| M3.1 | Status `APPROVED_FOR_AP` after MATCHED/TOLERANCE_MATCHED | Explicit AP queue gate |
| M3.2 | Freeze `exchange_rate` snapshot on post/approve | Historical FX for Phase 6 |
| M3.3 | `discount_amount` / `discount_pct` header fields | Commercial totals completeness |
| M3.4 | Reject edits after APPROVED_FOR_AP / POSTED | Immutable commercial handoff |

### M4. SalesInvoice Phase 6 handoff prep

| # | Feature | Why |
|---|---------|-----|
| M4.1 | Freeze exchange rate + commercial totals on post | AR source document |
| M4.2 | Draft cancel / refuse silent edit after POSTED | Integrity |
| M4.3 | Optional `void_draft` only — no credit note yet | Keep returns out |

### M5. Frontend adapters (minimal, no redesign)

| # | Feature | Why |
|---|---------|-----|
| M5.1 | Wire DomainRecord PO create/approve → typed PO when company session present | Stop dual-truth drift |
| M5.2 | Wire SO confirm/fulfill allocate → typed confirm (already partial) | Complete cutover |
| M5.3 | Surface typed bill match status / APPROVED_FOR_AP in bill panel | Ops visibility |

### M6. Read models for later reporting

| # | Feature | Why |
|---|---------|-----|
| M6.1 | Lightweight summary endpoints (PO open qty, SO reserved/dispatched/invoiced, bill match queue) | Feed Phase 8 later; no dashboards now |

**Out of MUST HAVE:** typed PR/RFQ, returns, credit/debit notes, pick/pack documents, payments, GL.

---

## 5. SHOULD HAVE

| ID | Feature | Why | If deferred cost |
|----|---------|-----|------------------|
| S1 | `CustomerItemPrice` (mirror `SupplierItemPrice`) | Customer-specific FG pricing | Manual SO prices |
| S2 | Apply `SupplierItemPrice` auto-fill on PO line create | Import price consistency | Manual PO prices |
| S3 | Commercial `SalesCreditNote` / `PurchaseDebitNote` (no stock, no GL) | Invoice corrections prep | Force Phase 6 to invent docs |
| S4 | Generic `CommercialAttachment` (PO/SO/Bill/Invoice/GRN) | Packing lists, certificates | Files stay outside ERP |
| S5 | Discount override warning when > config threshold | Matches UI `DISCOUNT_THRESHOLD_PCT` | Uncontrolled discounts |
| S6 | Multi-currency: require `exchange_rate` when currency ≠ company base | Nepal imports (CNY/USD→NPR) | Wrong NPR totals |
| S7 | Bridge: create typed PO from DomainRecord RFQ selection payload | Keep mock RFQ useful | Dual PO stores longer |
| S8 | SupplierBill approve permission distinct from post | Segregation of duties | Same role does all |

---

## 6. DEFER

| Item | Defer to | Reason |
|------|----------|--------|
| Typed Purchase Requisition | Later Slice / ops workshop | DomainRecord PR sufficient; EcoWrap can raise typed PO directly; Phase 3 analysis already ranked PR optional |
| Typed RFQ + SupplierQuote engine | Later | Comparison UI is mock; not on critical import path; risk of over-engineering |
| Separate Picking / Packing / Delivery documents | Not needed if flags OK | Phase 3 §12.2: pick/pack secondary flags; DispatchNote is stock boundary |
| Customer returns + restock QC | Slice C / Phase 5 | Touches QC + ledger reverse; high integrity risk |
| Supplier returns / debit from QC FAIL | Slice C / Phase 5 | Same; Phase 2 FAIL already holds REJECTED lots |
| Payments / settlement | Phase 6 | Accounting |
| GL / AP aging / AR aging / VAT filing | Phase 6 | Explicit boundary |
| Generic approval workflow engine | Phase 7 | Frontend mock exists; domain states enough for Slice B |
| OCR / WhatsApp / IRD | Phase 7 | Out of scope |
| BOM / MRP / WO | Phase 4 | Manufacturing |
| AI / dashboard redesign | Phase 8 | Out of scope |
| Full PO revision graph / supersession chain | Later | Controlled amend covers EcoWrap need |
| Hard credit-limit block | Policy flag already exists | Keep warning unless client confirms |

---

## 7. Model design (proposed — not implemented)

### 7.1 Extend existing (preferred)

**PurchaseOrder**

- No new table required for SENT/CLOSE (statuses exist)
- Optional: `supplier_confirmed_at`, `closed_at`, `closed_by`, `revision_no` (int, default 1)

**PurchaseOrderLine**

- Use existing `cancelled_quantity`
- Optional: `is_closed` bool or derive from remaining ≤ 0

**SalesOrder**

- Add: `promised_delivery_date`
- Add: `pick_status`, `pack_status` (string enums: NOT_STARTED / DONE) — operational only

**SalesOrderLine**

- Optional: `cancelled_quantity` (mirror PO) for partial line cancel

**SupplierBill**

- Add statuses: `APPROVED_FOR_AP` (or reuse SUBMITTED→POSTED with explicit approve action)
- Add: `discount_pct`, `discount_amount`, `exchange_rate` (freeze), `approved_for_ap_at`, `approved_for_ap_by`

**SalesInvoice**

- Add: `exchange_rate` freeze fields if missing; ensure POSTED immutability

### 7.2 New models (SHOULD HAVE only)

```text
CustomerItemPrice
  company, customer, item, uom, currency, unit_price,
  effective_from/to, min_qty

CommercialAttachment
  company, content_type/object_id OR (document_type + document_id),
  title, document_type, file_url, notes

SalesCreditNote / SalesCreditNoteLine   # commercial only
PurchaseDebitNote / PurchaseDebitNoteLine
```

### 7.3 Explicitly not created in Slice B

`PurchaseRequisition`, `RFQ`, `SupplierQuote`, `PickList`, `PackList`, `DeliveryChallan` (beyond DispatchNote), `SalesReturn`, `PurchaseReturn`, `Payment`, `JournalEntry`.

### 7.4 Relationships

```text
PO 1—* POLine
PO *—* Gate / Shipment (nullable FK) — already Slice A
POLine ← GRN line — already Slice A
PO ← SupplierBill — already Slice A
SO 1—* SOLine 1—* reservations (ref)
SO 1—* DispatchNote 1—* lines → issue_reserved_stock
SO / Dispatch ← SalesInvoice — already Slice A
Customer 1—* CustomerItemPrice *—1 Item   (SHOULD)
Supplier 1—* SupplierItemPrice *—1 Item   (exists)
```

---

## 8. State machines

### 8.1 PurchaseOrder (Slice B completes transitions)

```text
DRAFT → SUBMITTED → APPROVED → SENT
                              ↘ PARTIALLY_RECEIVED → RECEIVED → CLOSED
Any pre-receipt: → CANCELLED
CLOSED: reopen only via controlled service (optional SHOULD) → APPROVED/SENT if no bill posted
```

**Amend rules**

| Field | After APPROVED, no receipts | After partial receipt | After CLOSED / billed |
|-------|----------------------------|------------------------|------------------------|
| expected_delivery, notes | Yes | Yes | No |
| open line qty / price | Yes (bumps revision_no) | Only unreceived lines / cancel remaining | No |
| supplier / currency | No (cancel + new PO) | No | No |

### 8.2 SalesOrder

```text
DRAFT → (confirm) → RESERVED / PARTIALLY_RESERVED
      → PARTIALLY_DISPATCHED / DISPATCHED
      → PARTIALLY_INVOICED / INVOICED → COMPLETED
Line cancel: release reservations for that line; cannot cancel dispatched qty
```

Pick/pack flags do **not** change stock.

### 8.3 SupplierBill

```text
DRAFT → (match) → MATCHED | TOLERANCE_MATCHED | MISMATCHED
MATCHED/TOLERANCE → APPROVED_FOR_AP → POSTED (or POSTED implies AP-ready)
MISMATCHED: cannot approve
```

### 8.4 SalesInvoice

```text
DRAFT → POSTED
DRAFT → CANCELLED
POSTED: immutable (credit note later)
```

---

## 9. Service design

| Service | Actions |
|---------|---------|
| `po_services` (extend) | `mark_sent`, `close_po`, `cancel_po_line`, `amend_po` |
| `so_services` (extend) | `cancel_so_line`, `set_pick_pack_status`, price default helper |
| `bill_services` (extend) | `approve_for_ap`, freeze FX/discount on approve/post |
| `invoice_services` (extend) | freeze FX; cancel draft |
| `pricing_services` (new, thin) | `default_supplier_price`, `default_customer_price` |
| Optional SHOULD | `credit_note_services`, `attachment_services` |

**Hard rules**

- Never call `release_reservation()` then `fifo_issue()` for dispatch  
- Never modify `fifo_issue()` semantics  
- Never write stock from PO/SO/Bill/Invoice/CreditNote  
- All mutations `transaction.atomic` + `select_for_update` on parent docs  

---

## 10. API design (additive)

### Procurement

```text
POST /purchase/purchase-orders/{id}/mark-sent/
POST /purchase/purchase-orders/{id}/close/
POST /purchase/purchase-orders/{id}/amend/
POST /purchase/purchase-orders/{id}/lines/{line_id}/cancel-remaining/
POST /purchase/supplier-bills/{id}/approve-for-ap/
```

### Sales

```text
POST /sales/sales-orders/{id}/lines/{line_id}/cancel/
POST /sales/sales-orders/{id}/set-fulfillment/   # pick/pack flags
POST /sales/sales-invoices/{id}/cancel/          # DRAFT only
```

### SHOULD

```text
CRUD /crm/customer-item-prices/   or /sales/customer-item-prices/
CRUD /…/attachments/
CRUD commercial credit/debit notes + post (commercial)
```

### Reporting (read-only)

```text
GET /purchase/purchase-orders/summary/
GET /sales/sales-orders/summary/
GET /purchase/supplier-bills/?match_status=&status=APPROVED_FOR_AP
```

Keep DomainRecord routes.

---

## 11. Frontend adapter plan

1. Extend `phase3.ts` with new action paths.  
2. `purchase/cycle.ts`: `convertRfqToPo` / direct PO create → typed API when authenticated; keep DomainRecord list mirror optional.  
3. `amendPurchaseOrder`: call typed amend (not DomainRecord clone) when typed id present.  
4. `FulfillmentPanel`: pick/pack → typed fulfillment flags; allocate → typed confirm only.  
5. Bill panel: show server match + approve-for-AP.  
6. **No UI redesign**, no new modules, no OCR/IRD changes.

---

## 12. Event design

### Emit in Slice B MUST

| Event | When |
|-------|------|
| `PurchaseOrderSent` | mark sent |
| `PurchaseOrderClosed` | close |
| `PurchaseOrderAmended` | amend |
| `PurchaseOrderLineCancelled` | line cancel |
| `SalesOrderLineCancelled` | line cancel |
| `SupplierBillApprovedForAp` | approve-for-AP |

### Reuse

`PurchaseOrderApproved`, `PurchaseOrderReceiptProgress`, `SalesOrderConfirmed`, `DispatchPosted`, `SupplierBillMatched`/`Mismatched`, `SalesInvoicePosted`, Phase 2 stock events.

### Do not add yet

RFQ/PR/Quote events, return events, payment events, pick/pack document events.

---

## 13. Transaction / concurrency design

| Workflow | Lock | Guard |
|----------|------|-------|
| PO amend | PO + lines `select_for_update` | Reject if CLOSED/CANCELLED; reject price change if received>0 |
| PO line cancel | PO line + PO | Remaining = ordered − received − cancelled ≥ 0 |
| PO close | PO + all lines | No open receivable intent; optional require all lines complete or cancelled |
| SO line cancel | SO line + reservations | Block if dispatched>0; release open reservations |
| Bill approve-for-AP | Bill | Prefer MATCHED/TOLERANCE; freeze totals/FX |
| Invoice post | Existing + FX freeze | Dispatch posted; no stock writes |

No Redis. Database transactions only.

---

## 14. Company isolation

Every new/extended FK validated in services:

```text
company ↔ supplier/customer ↔ item ↔ warehouse
company ↔ PO/SO/Bill/Invoice
attachment.company == parent.company
CustomerItemPrice.company == customer.company == item.company
```

Reject cross-company with existing `CROSS_COMPANY_*` codes.

---

## 15. DomainRecord compatibility

| Document | Typed authority | DomainRecord |
|----------|-----------------|--------------|
| PO / SO / Dispatch / Bill / Invoice | Yes (Slice A + B) | List/UI mirror optional dual-write |
| PR / RFQ | No (defer) | Remains compatibility |
| Pick/pack | Flags on typed SO | DomainRecord fields can mirror |
| Returns / CN / DN | SHOULD commercial notes only | Mock until typed notes land |
| Stock / reservation / match | Never DomainRecord | — |

---

## 16. Accounting boundary

### Slice B may prepare

- Matched / approved supplier bills with frozen totals, tax, currency, FX, due dates  
- Posted sales invoices with frozen totals and dispatch/SO links  
- Optional commercial credit/debit note documents (SHOULD)  
- Approval timestamps and user ids  

### Slice B must NOT

- GL journals, AP/AR ledgers, aging, payments, bank rec, VAT returns, period close  

Phase 6 consumes `SupplierBill` (APPROVED_FOR_AP/POSTED) and `SalesInvoice` (POSTED) as source documents.

---

## 17. Test strategy

### MUST

- PO sent / close / line cancel / amend rules (received vs unreceived)  
- SO line cancel releases reservation; blocks after dispatch  
- Pick/pack flags do not create ledger rows  
- Bill approve-for-AP requires match; freezes FX; blocks edit  
- Invoice draft cancel; posted immutable; no ledger/GL  
- Company isolation on amend/cancel/approve  
- Full Phase 1+2+3A regression green  

### SHOULD

- CustomerItemPrice defaulting  
- Credit note commercial post no stock  
- Attachment company checks  

### Explicit non-tests

- No PR/RFQ typed flows  
- No return stock paths  
- No GL assertions beyond “zero journals created”

---

## 18. Migration strategy

1. Additive columns on PO/SO/Bill/Invoice (dates, flags, discount, FX freeze, revision_no).  
2. Optional new tables only for SHOULD models (`CustomerItemPrice`, attachments, credit/debit notes).  
3. No destructive Phase 2 alters.  
4. No data migration of historical DomainRecord PR/RFQ.  

**Do not create migrations until implementation approval.**

---

## 19. Critical decisions (with evidence)

### D1. Is PR/RFQ needed now?

| | |
|--|--|
| **Evidence** | DomainRecord PR/RFQ UI + mock cycle; Phase 3 §22 ranked PR/RFQ as Slice B *optional*; typed PO already creatable; EcoWrap import path starts at PO |
| **Recommendation** | **DEFER** typed PR/RFQ |
| **Consequence** | Keep DomainRecord PR/RFQ; PO remains direct-create; optional SHOULD bridge RFQ→typed PO |

### D2. Supplier Quote comparison?

| | |
|--|--|
| **Evidence** | `RfqCompare.tsx` + mock quotes in DomainRecord JSON |
| **Recommendation** | **DEFER** typed quotes; keep UI mock |
| **Consequence** | No `SupplierQuote` model in Slice B |

### D3. PO amendment/versioning?

| | |
|--|--|
| **Evidence** | Mock `amendPurchaseOrder` clones DomainRecord; typed PO has no amend; field `cancelled_quantity` unused |
| **Recommendation** | **MUST** controlled amend + line cancel; **DEFER** full revision graph |
| **Consequence** | Single PO row with `revision_no` bump; audit via events |

### D4. Separate Picking/Packing documents?

| | |
|--|--|
| **Evidence** | Phase 3 §12.2 flags; warehouse picking route = `FulfillmentQueue`; stock posts only on Dispatch |
| **Recommendation** | **DEFER** separate docs; **MUST** operational flags |
| **Consequence** | Preserve `issue_reserved_stock` as sole outbound stock path |

### D5. Customer returns now?

| | |
|--|--|
| **Evidence** | Mock only; requires QC + ledger reverse; Phase 3 deferred returns |
| **Recommendation** | **DEFER** to Slice C / Phase 5 |
| **Consequence** | No restock without future return engine |

### D6. Supplier returns now?

| | |
|--|--|
| **Evidence** | QC FAIL→REJECTED exists; no return-to-vendor typed flow |
| **Recommendation** | **DEFER** (same as D5) |
| **Consequence** | Rejected lots stay quarantined until later process |

### D7. Credit/Debit notes — Slice B or Phase 6?

| | |
|--|--|
| **Evidence** | Mock converters; invoices/bills need correction docs before GL |
| **Recommendation** | **SHOULD** commercial-only notes in Slice B; posting to GL in Phase 6 |
| **Consequence** | If skipped, Phase 6 invents documents under time pressure |

### D8. Customer-specific pricing?

| | |
|--|--|
| **Evidence** | `SupplierItemPrice` typed; Customer has no price list; SO lines take manual `unit_price` |
| **Recommendation** | **SHOULD** `CustomerItemPrice`; MUST price helper can start with supplier side only |
| **Consequence** | Without it, sales pricing stays manual |

### D9. Approval workflow?

| | |
|--|--|
| **Evidence** | PO already submit/approve; FE approval matrix mock; no typed workflow engine |
| **Recommendation** | **MUST** bill `approve-for-ap` domain action; **DEFER** generic engine (Phase 7) |
| **Consequence** | Explicit states, not workflow_record |

### D10. Attachments?

| | |
|--|--|
| **Evidence** | `SupplierDocument` only; commercial docs lack file metadata |
| **Recommendation** | **SHOULD** generic commercial attachments |
| **Consequence** | Files can stay external until then |

### D11. Required before Accounting Phase 6?

| Required | Why |
|----------|-----|
| Matched + AP-approvable SupplierBill with frozen totals/FX | AP source |
| Posted SalesInvoice with dispatch link + frozen totals | AR source |
| Stable PO/SO quantity lifecycle (close/cancel/amend) | Traceability |
| No silent DomainRecord stock/match authority | Already Slice A |

Not required before Phase 6: PR/RFQ, returns, payments, pick documents, dashboards.

---

## 20. Risks

| Risk | Mitigation |
|------|------------|
| Scope creep into PR/RFQ/returns | Hard DEFER list; MUST list only |
| Amend races with GRN post | Lock PO; reject qty/price amend when received>0 |
| Dual DomainRecord + typed PO | Prefer typed write; optional mirror |
| Approving mismatched bills | Approve-for-AP only MATCHED/TOLERANCE |
| Pick/pack mistaken for stock | Flags only; tests assert zero ledger |
| Credit notes mistaken for returns | Commercial-only; no lot/ledger |
| Phase 6 blocked by incomplete bill fields | MUST M3/M4 |

---

## 21. Implementation order (when approved)

```text
1. PO mark-sent / close / cancel-line / amend
2. SO line cancel + promised date + pick/pack flags
3. SupplierBill approve-for-ap + discount/FX freeze
4. SalesInvoice FX freeze + draft cancel
5. Pricing helpers (SupplierItemPrice; CustomerItemPrice if SHOULD approved)
6. FE adapters (PO/SO/bill)
7. Summary read APIs
8. (SHOULD) attachments + commercial credit/debit notes
9. Full regression Phase 1+2+3A + new Slice B tests
```

Stop after MUST unless SHOULD items are explicitly approved in the same gate.

---

## 22. Explicit out-of-scope list

- Modify Phase 2 ledger / FIFO / reservation / QC / landed / WH integrity  
- Change `issue_reserved_stock` algorithm except additive callers  
- Typed PR / RFQ / SupplierQuote engine  
- PickList / PackList / DeliveryChallan as stock documents  
- Customer/supplier returns stock flows  
- Payments, GL, AP/AR aging, bank rec, VAT filing  
- OCR, WhatsApp, IRD  
- BOM/MRP/WO/WIP  
- AI / dashboard redesign  
- Generic workflow engine  
- Frontend redesign  

---

## 23. Unresolved business questions

1. Confirm **DEFER** of typed PR/RFQ for first Slice B release?  
2. Under-receipt: auto-close PO lines or require manual close?  
3. Allow PO reopen after CLOSE if no bill posted?  
4. Approve credit-limit **hard block** now or keep warning?  
5. Include commercial Credit/Debit notes in same Slice B approval (SHOULD)?  
6. Company base currency code for FX requirement (NPR assumed)?  
7. Discount override threshold % (UI uses 10% on quotations)?  

---

## 24. Analysis metadata

| Item | Value |
|------|-------|
| Production code changed | **None** |
| Migrations created | **None** |
| Spec created | `docs/ERP-PHASE3-SLICE-B-SPEC.md` |
| Baseline | `2d36abbbd8bcd0b761713821c4a8889a0d96fdf7` |
| Existing reused | Slice A PO/SO/Dispatch/Bill/Invoice; Phase 2 stock; `SupplierItemPrice`; `SupplierDocument` pattern; `phase3_policy`; events; FE routes |
| Missing for ops | PO close/amend/line-cancel; SO line-cancel; bill AP-approve; FX freeze; pick/pack flags; pricing defaults |

---

**PHASE 3 SLICE B ANALYSIS COMPLETE — WAITING FOR IMPLEMENTATION APPROVAL**
