"""LC flow smoke. Usage: DEMO_EMAIL=... DEMO_PASSWORD=... [API_BASE=...] python scripts/phase1_api_smoke.py"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000/api/v1")
EMAIL = os.environ.get("DEMO_EMAIL")
PASSWORD = os.environ.get("DEMO_PASSWORD")
if not EMAIL or not PASSWORD:
    sys.exit("Set DEMO_EMAIL and DEMO_PASSWORD (and optionally API_BASE) before running this script.")


def call(method, url, token=None, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


login = call(
    "POST",
    f"{BASE}/auth/login/",
    body={"email": EMAIL, "password": PASSWORD},
)
token = login.get("access") or login.get("data", {}).get("access")
assert token, f"no token: {login}"

pos = call("GET", f"{BASE}/purchase/purchase-orders/", token)
po = pos["data"][0]
amt = "100000"

pi = call(
    "POST",
    f"{BASE}/purchase/proforma-invoices/",
    token,
    {
        "company": po["company"],
        "purchase_order": po["id"],
        "supplier": po["supplier"],
        "seller_pi_number": "PI-SMOKE",
        "currency_code": "USD",
        "total_amount": amt,
        "lead_time_days": 30,
    },
)["data"]

lc = call(
    "POST",
    f"{BASE}/purchase/letters-of-credit/",
    token,
    {
        "company": po["company"],
        "purchase_order": po["id"],
        "proforma_invoice": pi["id"],
        "supplier": po["supplier"],
        "bank_name": "Laxmi Sunrise Bank",
        "currency_code": "USD",
        "amount": amt,
    },
)["data"]

# Skip beneficiary OCR string — empty avoids false fail vs supplier legal name.
lc = call(
    "POST",
    f"{BASE}/purchase/letters-of-credit/{lc['id']}/scan-draft/",
    token,
    {"extracted": {"amount": amt, "currency": "USD"}},
)["data"]

lc = call("POST", f"{BASE}/purchase/letters-of-credit/{lc['id']}/run-match/", token, {})["data"]
print("MATCH", lc["status"], lc.get("match_result", {}).get("passed"), lc.get("match_result", {}).get("issues"))

lc = call(
    "POST",
    f"{BASE}/purchase/letters-of-credit/{lc['id']}/seller-ok/",
    token,
    {"note": "Yes OK"},
)["data"]

lc = call(
    "POST",
    f"{BASE}/purchase/letters-of-credit/{lc['id']}/issue-final/",
    token,
    {"final_lc_number": "LC-FINAL-SMOKE"},
)["data"]

lc = call(
    "POST",
    f"{BASE}/purchase/letters-of-credit/{lc['id']}/verify-pre-dispatch/",
    token,
    {"present_keys": ["commercial_invoice", "packing_list", "bill_of_lading", "coa"]},
)["data"]

print("FINAL_FLOW", lc["status"], lc.get("gate_allowed"), (lc.get("pre_dispatch_message") or "")[:80])
print("PI", pi["document_number"], "LC", lc["document_number"])
