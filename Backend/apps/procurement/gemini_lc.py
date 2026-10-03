"""Gemini AI extract actions for Letter of Credit — human still approves match/verify."""

from __future__ import annotations

from django.core.files.storage import default_storage
from django.utils import timezone

from apps.integrations.gemini import (
    GeminiError,
    extract_lc_draft,
    extract_pre_dispatch_keys,
)
from apps.procurement.lc_services import TradeFinanceError, attach_draft_lc_scan
from apps.procurement.trade_finance import LetterOfCredit


def _read_upload(uploaded) -> tuple[bytes, str, str | None]:
    if uploaded is None:
        raise TradeFinanceError("Upload a Draft LC image or PDF.", code="MISSING_FILE")
    name = getattr(uploaded, "name", "") or "scan.jpg"
    content_type = getattr(uploaded, "content_type", None)
    data = uploaded.read()
    if not data:
        raise TradeFinanceError("Uploaded file is empty.", code="EMPTY_FILE")
    return data, name, content_type


def _store_scan(lc: LetterOfCredit, uploaded, data: bytes) -> str:
    """Persist file under media for audit; return relative URL/path."""
    from django.core.files.base import ContentFile

    name = getattr(uploaded, "name", "") or "scan.jpg"
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()[:8]
    path = f"lc_scans/{lc.company_id}/{lc.id}/{timezone.now().strftime('%Y%m%d%H%M%S')}{ext or '.bin'}"
    saved = default_storage.save(path, ContentFile(data))
    try:
        return default_storage.url(saved)
    except Exception:
        return saved


def ai_extract_and_attach_draft_lc(*, lc: LetterOfCredit, uploaded, user=None) -> LetterOfCredit:
    data, name, content_type = _read_upload(uploaded)
    # Rewind for storage if needed
    if hasattr(uploaded, "seek"):
        try:
            uploaded.seek(0)
        except Exception:
            pass
    extracted = extract_lc_draft(file_bytes=data, filename=name, content_type=content_type)
    scan_url = ""
    try:
        if hasattr(uploaded, "seek"):
            uploaded.seek(0)
        scan_url = _store_scan(lc, uploaded, data)
    except Exception:
        # Extraction succeeded; storage failure should not block workflow
        scan_url = ""

    return attach_draft_lc_scan(
        lc,
        extracted=extracted,
        draft_scan_url=scan_url,
        user=user,
    )


def ai_suggest_pre_dispatch(*, uploads: list) -> dict:
    files: list[tuple[bytes, str, str | None]] = []
    for up in uploads:
        if not up:
            continue
        data, name, ct = _read_upload(up)
        files.append((data, name, ct))
    if not files:
        raise TradeFinanceError("Upload at least one pre-dispatch document photo.", code="MISSING_FILE")
    if len(files) > 8:
        raise GeminiError("Too many files (max 8).", code="TOO_MANY_FILES")
    return extract_pre_dispatch_keys(files=files)
