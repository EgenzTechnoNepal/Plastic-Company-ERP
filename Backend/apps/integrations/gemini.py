"""Google Gemini document extraction — single AI provider for EcoWrap OCR/scan.

Uses the Generative Language REST API (no Azure/AWS). Calls happen only on upload.
Human Approve / match / verify steps remain required in the workflow.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

from apps.core.exceptions import ERPError

logger = logging.getLogger("apps.integrations.gemini")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiError(ERPError):
    default_code = "GEMINI_ERROR"
    status_code = 502


class GeminiNotConfiguredError(ERPError):
    default_code = "GEMINI_NOT_CONFIGURED"
    status_code = 503


def gemini_configured() -> bool:
    key = (settings.ERP_INTEGRATIONS.get("GOOGLE_GEMINI_API_KEY") or "").strip()
    return bool(key)


def gemini_model() -> str:
    return (settings.ERP_INTEGRATIONS.get("GEMINI_MODEL") or "gemini-2.0-flash").strip()


def _api_key() -> str:
    key = (settings.ERP_INTEGRATIONS.get("GOOGLE_GEMINI_API_KEY") or "").strip()
    if not key:
        # Legacy alias
        key = (settings.ERP_INTEGRATIONS.get("OCR_PROVIDER_API_KEY") or "").strip()
    if not key:
        raise GeminiNotConfiguredError(
            "GOOGLE_GEMINI_API_KEY is not set. Add it to Backend/.env to enable AI scan.",
            code="GEMINI_NOT_CONFIGURED",
        )
    return key


def _guess_mime(filename: str, content_type: str | None = None) -> str:
    if content_type and content_type.startswith("image/"):
        return content_type
    if content_type == "application/pdf":
        return "application/pdf"
    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    if name.endswith(".pdf"):
        return "application/pdf"
    return "image/jpeg"


def _parse_json_loose(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {"raw": data}
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        try:
            data = json.loads(fence.group(1).strip())
            return data if isinstance(data, dict) else {"raw": data}
        except json.JSONDecodeError:
            pass
    brace = re.search(r"\{[\s\S]*\}", text)
    if brace:
        try:
            data = json.loads(brace.group(0))
            return data if isinstance(data, dict) else {"raw": data}
        except json.JSONDecodeError:
            pass
    return {"raw_text": text}


def generate_json(
    *,
    prompt: str,
    file_bytes: bytes | None = None,
    mime_type: str = "image/jpeg",
    files: list[tuple[bytes, str]] | None = None,
) -> dict[str, Any]:
    """
    Call Gemini once and parse a JSON object from the response.
    Pass either file_bytes or files=[(bytes, mime), ...].
    """
    key = _api_key()
    model = gemini_model()
    parts: list[dict[str, Any]] = [{"text": prompt}]

    payloads = list(files or [])
    if file_bytes is not None:
        payloads.insert(0, (file_bytes, mime_type))
    if not payloads:
        raise GeminiError("No file provided for Gemini extraction.")

    for blob, mime in payloads:
        if not blob:
            continue
        if len(blob) > 15 * 1024 * 1024:
            raise GeminiError("File too large for Gemini (max ~15MB).", code="GEMINI_FILE_TOO_LARGE")
        parts.append(
            {
                "inline_data": {
                    "mime_type": mime or "image/jpeg",
                    "data": base64.b64encode(blob).decode("ascii"),
                }
            }
        )

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent?key={key}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        logger.warning("gemini_http_error status=%s body=%s", exc.code, detail)
        raise GeminiError(
            f"Gemini API error ({exc.code}). Check API key and model name.",
            code="GEMINI_HTTP_ERROR",
            fields={"status": exc.code, "detail": detail},
        ) from exc
    except urllib.error.URLError as exc:
        raise GeminiError(f"Cannot reach Gemini: {exc.reason}", code="GEMINI_NETWORK") from exc

    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("gemini_unexpected_response keys=%s", list(raw.keys()) if isinstance(raw, dict) else type(raw))
        raise GeminiError("Gemini returned an empty or unexpected response.") from exc

    return _parse_json_loose(text)


LC_DRAFT_PROMPT = """You are extracting fields from a Letter of Credit (Draft LC) document for an ERP.
Return ONLY a JSON object with these keys (use null if unknown):
{
  "amount": "numeric string without currency symbol",
  "currency": "ISO currency code e.g. USD",
  "beneficiary": "seller / beneficiary name",
  "lc_number": "LC reference if present",
  "bank_name": "issuing bank if present",
  "expiry_date": "YYYY-MM-DD or null",
  "latest_shipment_date": "YYYY-MM-DD or null",
  "notes": "short free text if useful"
}
Be precise. Amounts as plain numbers like "1000.00". Currency as 3-letter code."""


PRE_DISPATCH_PROMPT = """You review export / LC pre-dispatch document photos for Nepal import customs (भन्सार).
Decide which of these document types are clearly present in the images.
Return ONLY JSON:
{
  "present_keys": ["commercial_invoice", "packing_list", "bill_of_lading", "coa"],
  "missing_keys": [],
  "confidence": 0.0,
  "summary": "one short sentence"
}
Allowed keys ONLY: commercial_invoice, packing_list, bill_of_lading, coa.
Include a key in present_keys only if you can see that document type. Otherwise put it in missing_keys."""


GATE_BILL_PROMPT = """Extract supplier invoice / bill fields for a factory gate entry ERP.
Return ONLY JSON:
{
  "supplier_name": "",
  "supplier_pan": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD or null",
  "currency": "NPR or USD etc",
  "gross_total": "numeric string",
  "vat_amount": "numeric string or null",
  "net_total": "numeric string or null",
  "line_items": [{"description": "", "qty": "", "rate": "", "amount": ""}],
  "notes": ""
}"""


def extract_lc_draft(*, file_bytes: bytes, filename: str = "", content_type: str | None = None) -> dict[str, Any]:
    mime = _guess_mime(filename, content_type)
    data = generate_json(prompt=LC_DRAFT_PROMPT, file_bytes=file_bytes, mime_type=mime)
    # Normalize common aliases for rules_v1 match
    out = dict(data)
    if "currency" not in out and out.get("currency_code"):
        out["currency"] = out["currency_code"]
    if "amount" in out and out["amount"] is not None:
        out["amount"] = str(out["amount"]).replace(",", "").strip()
    out["_engine"] = "gemini"
    out["_model"] = gemini_model()
    return out


def extract_pre_dispatch_keys(
    *,
    files: list[tuple[bytes, str, str]],
) -> dict[str, Any]:
    """files: list of (bytes, filename, content_type)."""
    payloads = [(_b, _guess_mime(_n, _ct)) for _b, _n, _ct in files if _b]
    data = generate_json(prompt=PRE_DISPATCH_PROMPT, files=payloads)
    allowed = {"commercial_invoice", "packing_list", "bill_of_lading", "coa"}
    present = [k for k in (data.get("present_keys") or []) if k in allowed]
    missing = [k for k in (data.get("missing_keys") or []) if k in allowed]
    for k in allowed:
        if k not in present and k not in missing:
            missing.append(k)
    return {
        "present_keys": present,
        "missing_keys": missing,
        "confidence": data.get("confidence"),
        "summary": data.get("summary") or "",
        "_engine": "gemini",
        "_model": gemini_model(),
    }


def extract_gate_bill(*, file_bytes: bytes, filename: str = "", content_type: str | None = None) -> dict[str, Any]:
    mime = _guess_mime(filename, content_type)
    data = generate_json(prompt=GATE_BILL_PROMPT, file_bytes=file_bytes, mime_type=mime)
    data["_engine"] = "gemini"
    data["_model"] = gemini_model()
    return data
