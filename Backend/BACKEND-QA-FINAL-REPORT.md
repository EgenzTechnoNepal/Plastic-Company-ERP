# EcoWrap ERP — Backend QA & Integration Verification

**Prepared:** 9 October 2026  
**Overall recommendation: CHANGES REQUIRED**

## Executive summary

The assigned backend workflows were exercised with targeted tests, including the end-to-end API smoke test. The smoke test passed after correcting an invalid test assumption about pre-existing fixture stock. Purchase/receiving, QC, inventory/FIFO (including PostgreSQL concurrency), approval, and the tested Production/BOM service workflows passed their reported targeted checks.

The full regression suite is **not green**: 307 tests ran and 6 failed. Those failures reproduce two CRM contact/activity validation defects, three landed-cost posted-document mutation defects, and one Sales invoice-versus-dispatch validation defect. Both migration checks completed successfully. Do not approve the affected workflows for merge until the defects are fixed and the regression tests pass.

## Verification basis and limitations

- The QA workspace was on `feature/backend-qa-integrations-verifications`. It was **not** confirmed against a fresh checkout and pull of `main`; therefore this report does not claim that the tested tree is the latest `main`.
- The reports identify Anuska PR #2 and Dikesh PRs #1 and #3 as the requested review scope. No current PR metadata or fresh PR-diff review was performed for this final report; verify the PRs against the intended base before treating this as a review of their latest revisions.
- The test outcomes below are from the user-provided command outputs and the existing task reports. The assistant did not run tests for this final report.
- No production implementation fixes are included in this report. QA regressions and reports are local/uncommitted; **nothing has been committed** and no QA PR has been created.

## 1. Tests passed

| Workflow/check | Reported result |
|---|---|
| Purchase / GRN | 26 passed |
| QC | 19 passed |
| Inventory / FIFO, non-concurrency selection | 26 passed |
| Inventory reservation/issue concurrency on PostgreSQL (`--keepdb`) | 4 passed, no skips |
| Approval | 11 passed |
| Production / BOM service workflows | 37 passed |
| API smoke: Supplier/PO → Gate Entry → GRN → QC HOLD → QC PASS → available stock → reservation → dispatch → invoice | 1 passed |
| Full backend suite | 301 passed; 6 failed (307 total) |
| `makemigrations --check` | No changes detected |
| `migrate --check` | Completed without reported errors |

The smoke test verifies persisted state, not only HTTP responses: the GRN remains QC-held until pass, reservation does not immediately consume physical stock, dispatch consumes reserved stock and writes a linked ISSUE ledger row, and invoice posting does not add another stock mutation.

### Targeted suites with failures

- **Sales:** 34 passed, 1 failed.
- **CRM:** 17 passed, 2 failed.
- **Landed cost:** 15 passed, 3 failed; the attempted selection also had one test-loader error because an invalid class name was specified. That loader error is not a product defect.

The Task 3 report also notes that a corrected formatting-sensitive all-categories assertion was not rerun. No pass is claimed for that assertion.

## 2. Tests failed

The full regression run reported six failures:

| Module | Regression test | Result |
|---|---|---|
| CRM | `test_customer_activity_rejects_supplier_contact` | Expected `CrmError`; none raised. |
| CRM | `test_supplier_activity_rejects_customer_contact` | Expected `CrmError`; none raised. |
| Landed cost | `test_landed_cost_component_cannot_be_added_after_posting` | Expected HTTP 400; API returned HTTP 201 and created the component. |
| Landed cost | `test_posted_landed_cost_component_cannot_be_edited` | Expected HTTP 400; API returned HTTP 200. |
| Landed cost | `test_posted_landed_cost_document_purchase_cost_cannot_be_edited` | Expected HTTP 400; API returned HTTP 200. |
| Sales | `test_invoice_cannot_exceed_quantity_on_linked_dispatch` | Expected `SalesInvoiceError`; none raised. |

## 3. Bugs found

### CRM — customer activity accepts supplier contact

**Problem:** A customer activity can be associated with a contact linked only to a supplier.  
**How to reproduce:** Run `python manage.py test apps.crm.tests.test_phase_b_crm.CrmServiceIsolationTests.test_customer_activity_rejects_supplier_contact`.  
**Expected:** Reject with `CrmError` (`CONTACT_MISMATCH`) and do not persist the activity.  
**Actual:** No `CrmError` was raised; the activity was accepted.  
**Severity:** Medium.

### CRM — supplier activity accepts customer contact

**Problem:** A supplier activity can be associated with a contact linked only to a customer.  
**How to reproduce:** Run `python manage.py test apps.crm.tests.test_phase_b_crm.CrmServiceIsolationTests.test_supplier_activity_rejects_customer_contact`.  
**Expected:** Reject with `CrmError` (`CONTACT_MISMATCH`) and do not persist the activity.  
**Actual:** No `CrmError` was raised; the activity was accepted.  
**Severity:** Medium.

### Landed cost — posted purchase cost is mutable

**Problem:** The purchase cost on a posted landed-cost document can be edited through the API.  
**How to reproduce:** Run `python manage.py test apps.inventory.tests.test_phase1_masters.LandedCostTests.test_posted_landed_cost_document_purchase_cost_cannot_be_edited`.  
**Expected:** Reject the edit and preserve the posted valuation.  
**Actual:** PATCH returned HTTP 200 and changed purchase unit cost to `1200.000000` while purchase value remained `100000.0000`.  
**Severity:** High.

### Landed cost — posted component is mutable

**Problem:** A cost component on a posted landed-cost document can be edited through the API.  
**How to reproduce:** Run `python manage.py test apps.inventory.tests.test_phase1_masters.LandedCostTests.test_posted_landed_cost_component_cannot_be_edited`.  
**Expected:** Reject the edit and preserve the posted cost component.  
**Actual:** PATCH returned HTTP 200 and changed amount to `15000.0000` while base-currency amount remained `10000.0000`.  
**Severity:** High.

### Landed cost — component can be added after posting

**Problem:** A new cost component can be added to an already-posted landed-cost document.  
**How to reproduce:** Run `python manage.py test apps.inventory.tests.test_phase1_masters.LandedCostTests.test_landed_cost_component_cannot_be_added_after_posting`.  
**Expected:** Reject creation and leave the posted document unchanged.  
**Actual:** POST returned HTTP 201 and persisted the component.  
**Severity:** High.

### Sales — invoice can exceed linked dispatch quantity

**Problem:** An invoice line can exceed the quantity on its linked dispatch.  
**How to reproduce:** Run `python manage.py test apps.sales.tests.test_phase3_hardening.InvoiceHardeningTests.test_invoice_cannot_exceed_quantity_on_linked_dispatch`. The test orders 10 units, dispatches 4, then attempts to invoice 5 against that dispatch.  
**Expected:** Reject the invoice line and preserve invoice/order quantities.  
**Actual:** `SalesInvoiceError` was not raised.  
**Severity:** High.

## 4. PRs reviewed

Requested PR scope:

- Anuska PR #2
- Dikesh PR #1


The workflow reports list these PRs as the intended review scope. The QA workspace branch/base limitation above means the final report does not certify the current tip of those PRs or that all tested commits are based on the latest `main`.

## 5. Recommendation

**CHANGES REQUIRED.**

The migration checks and several targeted workflows passed, and the purchase-to-invoice API smoke test passed with database-state assertions. However, six reproducible failures remain in CRM, landed cost, and Sales. Fix those defects and rerun the targeted suites and full regression suite before merge approval.

