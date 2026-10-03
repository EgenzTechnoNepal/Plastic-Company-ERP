"""
Demo foundation API smoke against a running backend seeded with `seed_m2_demo_chain`.

    DEMO_EMAIL=... DEMO_PASSWORD=... [API_BASE=http://127.0.0.1:8000/api/v1] python scripts/demo_api_smoke.py

Checks: real auth (bad password is rejected), the seeded typed chain is readable over the
typed endpoints, and a typed approval request round-trips (create -> approve, create -> cancel).
Exits non-zero on the first failure.
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000/api/v1").rstrip("/")
EMAIL = os.environ.get("DEMO_EMAIL")
PASSWORD = os.environ.get("DEMO_PASSWORD")
if not EMAIL or not PASSWORD:
    sys.exit("Set DEMO_EMAIL and DEMO_PASSWORD (and optionally API_BASE) before running this script.")

failures = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{f' - {detail}' if detail else ''}")
    if not ok:
        failures.append(name)


def call(method, path, token=None, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw or b"{}")
        except ValueError:
            return exc.code, {"raw": raw.decode(errors="replace")[:200]}


def unwrap(payload):
    return payload.get("data", payload) if isinstance(payload, dict) else payload


def find(token, path, code):
    """Return the first row on a typed list endpoint whose fields contain `code`."""
    for query in (f"?search={code}&page_size=200", "?page_size=200"):
        status, payload = call("GET", f"{path}{query}", token)
        if status != 200:
            return status, None
        for row in unwrap(payload) or []:
            if code in {str(v) for v in row.values() if isinstance(v, (str, int))}:
                return status, row
    return 200, None


status, _ = call("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD + "-wrong"})
check("bad password rejected", status in (400, 401), f"HTTP {status}")

status, login = call("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD})
token = (login.get("access") or unwrap(login).get("access")) if isinstance(login, dict) else None
check("login", status == 200 and bool(token), f"HTTP {status}")
if not token:
    sys.exit(1)

chain = [
    ("purchase order", "/purchase/purchase-orders/", "PO-M2-DEMO-001", None),
    ("proforma invoice", "/purchase/proforma-invoices/", "PI-M2-DEMO-001", None),
    ("letter of credit", "/purchase/letters-of-credit/", "LC-M2-DEMO-001", "DOCS_CLEARED"),
    ("gate entry", "/purchase/inbound-gates/", "GE-M2-DEMO-001", None),
    ("goods receipt", "/purchase/goods-receipts/", "GRN-M2-DEMO-001", None),
    ("qc inspection", "/quality/lot-inspections/", "QC-M2-DEMO-001", None),
    ("inventory lot", "/inventory/lots/", "LOT-M2-PLA-001", "AVAILABLE"),
    ("landed cost", "/inventory/landed-cost-documents/", "LCD-M2-DEMO-001", None),
    ("putaway", "/warehouse/putaways/", "PUT-M2-DEMO-001", None),
    ("supplier bill", "/purchase/supplier-bills/", "BILL-M2-DEMO-001", None),
]
rows = {}
for label, path, code, expected_status in chain:
    status, row = find(token, path, code)
    got = (row or {}).get("status")
    ok = row is not None and (expected_status is None or str(got).upper() == expected_status)
    check(f"{label} {code}", ok, f"HTTP {status}, status={got}")
    rows[label] = row or {}

po_row = rows["purchase order"] or None
if po_row:
    for label in ("proforma invoice", "letter of credit", "gate entry", "supplier bill"):
        linked = rows[label].get("purchase_order")
        check(f"{label} linked to {po_row.get('document_number')}", str(linked) == str(po_row["id"]), f"purchase_order={linked}")

if po_row:
    approval_body = {
        "company": po_row["company"],
        "module_code": "purchase",
        "target_type": "demo_smoke_check",
        "target_id": po_row["id"],
        "document_number": po_row.get("document_number", ""),
        "title": "Demo smoke approval",
    }
    for decision in ("approve", "cancel"):
        status, created = call("POST", "/workflow/approval-requests/", token, approval_body)
        created = unwrap(created)
        if status != 201:
            check(f"approval request ({decision})", False, f"HTTP {status} {created}")
            continue
        status, decided = call(
            "POST", f"/workflow/approval-requests/{created['id']}/{decision}/", token, {"reason": "demo smoke"}
        )
        decided = unwrap(decided)
        expected = "APPROVED" if decision == "approve" else "CANCELLED"
        check(
            f"typed approval {decision}",
            status == 200 and str(decided.get("status")).upper() == expected,
            f"HTTP {status}, status={decided.get('status')}, decided_by={decided.get('decided_by_email')}",
        )

status, _ = call("GET", "/purchase/purchase-orders/")
check("unauthenticated list rejected", status in (401, 403), f"HTTP {status}")

print("RESULT", "PASS" if not failures else f"FAIL ({len(failures)}): {', '.join(failures)}")
sys.exit(1 if failures else 0)
