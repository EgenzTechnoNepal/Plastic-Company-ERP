"""
Demo API smoke against a running backend seeded with `seed_m2_demo_chain --full`.

    DEMO_EMAIL=... DEMO_PASSWORD=... [API_BASE=http://127.0.0.1:8000/api/v1] python scripts/demo_api_smoke.py

Checks the complete demo chain: Login -> Supplier -> Item -> Warehouse -> Purchase Order
-> GRN -> QC -> Inventory -> Sales Order -> Reservation -> Dispatch -> Invoice.
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


def find_row(token, path, predicate):
    """Return the first row on a typed list endpoint matching predicate."""
    status, payload = call("GET", f"{path}?page_size=200", token)
    if status != 200:
        return status, None
    for row in unwrap(payload) or []:
        if predicate(row):
            return status, row
    return status, None


status, _ = call("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD + "-wrong"})
check("bad password rejected", status in (400, 401), f"HTTP {status}")

status, login = call("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD})
token = (login.get("access") or unwrap(login).get("access")) if isinstance(login, dict) else None
check("login", status == 200 and bool(token), f"HTTP {status}")
if not token:
    sys.exit(1)

chain = [
    ("supplier", "/purchase/vendors/", "SUP-CN-PLA", None),
    ("item", "/inventory/items/", "RM-PLA-001", None),
    ("warehouse", "/warehouse/facilities/", "WH-RM", None),
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
    ("sales order", "/sales/sales-orders/", "SO-M2-DEMO-001", "INVOICED"),
    ("dispatch", "/sales/dispatch-notes/", "DN-M2-DEMO-001", "POSTED"),
    ("invoice", "/sales/sales-invoices/", "INV-M2-DEMO-001", "POSTED"),
]
rows = {}
for label, path, code, expected_status in chain:
    status, row = find(token, path, code)
    got = (row or {}).get("status")
    ok = row is not None and (expected_status is None or str(got).upper() == expected_status)
    check(f"{label} {code}", ok, f"HTTP {status}, status={got}")
    rows[label] = row or {}

po_row = rows["purchase order"] or None
so_row = rows["sales order"] or None

if po_row and rows["item"].get("id") and rows["warehouse"].get("id"):
    status, balance = call(
        "GET",
        f"/inventory/balances/?company={po_row['company']}&item={rows['item']['id']}"
        f"&warehouse={rows['warehouse']['id']}",
        token,
    )
    balance = unwrap(balance) if status == 200 else {}
    check(
        "inventory balance available quantity",
        status == 200 and float(balance.get("available_to_consume") or 0) >= 0,
        f"HTTP {status}, balance={balance}",
    )
else:
    check("inventory balance available quantity", False, "upstream chain object missing")

if so_row:
    sales_line_ids = {str(line["id"]) for line in so_row.get("lines", [])}
    status, reservation = find_row(
        token,
        "/inventory/reservations/",
        lambda row: str(row.get("reference_id")) in sales_line_ids,
    )
    check(
        "reservation linked to sales order",
        status == 200
        and reservation is not None
        and str(reservation.get("reference_type")).upper() == "SALES_ORDER_LINE"
        and str(reservation.get("status")).upper() in {"OPEN", "RELEASED"},
        f"HTTP {status}, reservation={reservation}",
    )
else:
    check("reservation linked to sales order", False, "sales order was not found")

if po_row:
    for label in ("proforma invoice", "letter of credit", "gate entry", "supplier bill"):
        linked = rows[label].get("purchase_order")
        check(f"{label} linked to {po_row.get('document_number')}", str(linked) == str(po_row["id"]), f"purchase_order={linked}")

if po_row:
    status, journey = call("GET", f"/purchase/purchase-orders/{po_row['id']}/inbound-journey/", token)
    journey = unwrap(journey) if status == 200 else {}
    lot = next((x for x in journey.get("lots", []) if x.get("lot_number") == "LOT-M2-PLA-001"), {})
    check(
        "inbound journey: lot AVAILABLE in storage, landed 1280 / purchase 1000",
        lot.get("status") == "AVAILABLE"
        and (lot.get("bin") or {}).get("type") not in ("QC_HOLD", "RECEIVING")
        and float(lot.get("landed_unit_cost") or 0) == 1280
        and float(lot.get("purchase_unit_cost") or 0) == 1000,
        f"HTTP {status}, status={lot.get('status')}, bin={(lot.get('bin') or {}).get('code')}, "
        f"landed={lot.get('landed_unit_cost')}, purchase={lot.get('purchase_unit_cost')}",
    )
    lc = journey.get("letter_of_credit") or {}
    check(
        "inbound journey: LC check labelled rules-based",
        (lc.get("match") or {}).get("engine_kind") == "rules" and "AI" not in lc.get("status_label", ""),
        f"engine={(lc.get('match') or {}).get('engine')}, label={lc.get('status_label')}",
    )

status, blocked_po = find(token, "/purchase/purchase-orders/", "PO-M2-DEMO-003")
if blocked_po:
    status, payload = call(
        "POST", "/purchase/inbound-gates/record/", token,
        {"purchase_order": blocked_po["id"], "vehicle_number": "SMOKE-0001"},
    )
    code = (payload.get("error") or {}).get("code") if isinstance(payload, dict) else None
    _, blocked_journey = call("GET", f"/purchase/purchase-orders/{blocked_po['id']}/inbound-journey/", token)
    gates = (unwrap(blocked_journey) or {}).get("gates", [])
    check("LC gate blocks gate entry (no gate created)", status == 400 and code == "LC_GATE_BLOCKED" and not gates,
          f"HTTP {status}, code={code}, gates={len(gates)}")
else:
    check("PO-M2-DEMO-003 present", False, f"HTTP {status}")

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
