# Task 7: Cross-Company GRN Bug

## Work completed

- Reproduced the cross-company GRN reference issue. Before the fix, the create API accepted foreign gate-entry and shipment references; update accepted a foreign gate reference.
- Added two-company regression tests for direct `post_grn()`, API create, update, and post.
- Added same-company validation for GRN gate-entry and shipment references before posting writes and through the API write-validation path.
- Adjusted the GRN row lock to avoid PostgreSQL locking nullable related rows.

## Verification

Database backend: PostgreSQL.

```bash
python manage.py test apps.procurement.tests.test_post_grn_bin_validation --keepdb --verbosity 2
```

Result: **7 tests passed in 1.813s** on PostgreSQL. Django's system check reported no issues, and no migrations were pending. Rejected operations assert `CROSS_COMPANY_REFERENCE`, preserved GRN and foreign-reference state, and unchanged inventory-lot, receipt-layer, and stock-ledger counts.

`git diff --check` passed.

## Known issue and status

An additional existing GRN/PO test run had 7 passes and 2 errors in `submit_gate_entry()`, caused by PostgreSQL's nullable-join `FOR UPDATE` restriction. This separate path was not changed.



## Changed files

- `Backend/apps/organization/company_scope.py`
- `Backend/apps/procurement/inbound_services.py`
- `Backend/apps/procurement/tests/test_post_grn_bin_validation.py`
