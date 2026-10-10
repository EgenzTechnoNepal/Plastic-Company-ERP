# Task 7 Report: Prevent Cross-Company GRN References

**Issue severity:** High — tenant isolation and inbound inventory workflow integrity
**Status:** Task 7 investigation, implementation, regression tests, and focused verification are complete. This report is ready to include with the PR.

## Request

Investigate and prevent a Company A Goods Receipt Note (GRN) from referencing a Company B gate entry or import shipment. A posted GRN must not change a foreign gate entry's status or write inventory records. Apply the same-company check to relevant GRN API create and update paths, add regression tests, and verify against PostgreSQL where available.

## Investigation and reproduction

- Confirmed the model relationships: `GoodsReceiptNote.gate_entry` points to `GateEntry`, and `GoodsReceiptNote.shipment` points to `ImportShipment`; both referenced models have a direct `company` foreign key.
- Confirmed the API routes:
  - `POST /api/v1/purchase/goods-receipts/` — create.
  - `PATCH /api/v1/purchase/goods-receipts/{id}/` — update.
  - `POST /api/v1/purchase/goods-receipts/{id}/post/` — post.
- Inspected the serializer and the shared `CompanyScopedMixin` write validation used by the GRN viewset.
- Before validation was added, focused API tests showed create accepted foreign gate and shipment references with HTTP 201 and update accepted a foreign gate reference with HTTP 200.
- The original PostgreSQL reproduction reported `grn_status=POSTED`, `foreign_gate_status=LINKED_TO_GRN`, and distinct company IDs.
- Initial direct-service regression attempts exposed a PostgreSQL query error: an unrestricted `select_for_update()` included nullable related joins, which PostgreSQL does not allow on the nullable side of an outer join.

## Changes made

- Added `gate_entry: company` and `shipment: company` to the shared same-company write-validation mapping. This covers GRN create and update.
- Added `assert_related_same_company()` checks for the GRN gate entry and shipment in `post_grn()`, before inventory writes.
- Preserved and explicitly tested the receiving-bin/warehouse check in `post_grn()`. A receiving bin from a different warehouse is rejected with `BIN_WAREHOUSE_MISMATCH`; a valid same-warehouse bin remains accepted.
- Kept `select_for_update(of=("self",))` scoped to the GRN row. This is specifically required for PostgreSQL compatibility with the nullable references selected by the posting query; it is not a broader lock change.
- Added/retained focused regression coverage for direct posting, API create/update/post, bin validation, duplicate posting, over-receipt rejection, multi-line rollback, and rollback after a ledger-write failure.

## Expected and verified behavior

For cross-company gate-entry or shipment references:

- API create, update, and post reject with HTTP 403 and `CROSS_COMPANY_REFERENCE`.
- Direct `post_grn()` rejects with `CROSS_COMPANY_REFERENCE`.
- Rejected posting leaves the GRN in DRAFT and the foreign gate entry in SUBMITTED.
- Invalid API create does not create a GRN.
- Inventory lot, receipt-layer, and stock-ledger counts remain unchanged.
- The foreign shipment's company/activity state remains unchanged.

The suite additionally verifies that:

- A bin from another warehouse is rejected with `BIN_WAREHOUSE_MISMATCH`, with no inventory writes.
- A bin from the GRN's warehouse is accepted.
- A duplicate post raises `DUPLICATE_POST` without additional inventory writes.
- Over-receipt rejection leaves the GRN and gate in their original states, with no lot/layer links or inventory records.
- A multi-line GRN with an invalid later line leaves all lines unlinked and creates no inventory records.
- A simulated ledger-write failure rolls back created inventory records and GRN line links.

## Test results

Confirmed database backend: **PostgreSQL**.

Command run from `Backend`:

```bash
python manage.py test apps.procurement.tests.test_post_grn_bin_validation --keepdb --verbosity 2
```

**Result: 13 tests passed in 2.753s.** Django reported no system-check issues and no unapplied migrations. `git diff --check` passed.

## Changed files

- `Backend/apps/organization/company_scope.py` — same-company validation mapping for gate entries and shipments; present in the current branch.
- `Backend/apps/procurement/inbound_services.py` — pre-write reference validation, receiving-bin guard, and PostgreSQL row-lock scope.
- `Backend/apps/procurement/tests/test_post_grn_bin_validation.py` — cross-company API/service and posting regression coverage, plus bin, duplicate-post, over-receipt, and rollback cases.


## Separate follow-up: `submit_gate_entry()` PostgreSQL locking

This issue is documented as a separate follow-up and is outside Task 7's scope. An additional existing focused GRN/PO test run previously reported two PostgreSQL errors because `submit_gate_entry()` uses an unrestricted `select_for_update()` after `select_related()` joins nullable references (`shipment` and `shipment__purchase_order`). PostgreSQL cannot apply `FOR UPDATE` to the nullable side of an outer join. The locking behavior in `submit_gate_entry()` remains unresolved and should be investigated and fixed in its own change, with PostgreSQL regression coverage.
