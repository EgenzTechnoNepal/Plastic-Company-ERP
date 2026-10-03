"""Phase 1 LC / Proforma services — client import workflow (rules match; OCR/AI later)."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.events import emit
from apps.core.exceptions import ERPError, InvalidStatusTransitionError
from apps.core.services.numbering import generate_document_number
from apps.inventory.services import _as_decimal
from apps.organization.company_scope import assert_company_allowed, assert_related_same_company
from apps.procurement.commercial import PurchaseOrder, PurchaseOrderLine
from apps.procurement.trade_finance import (
    LC_TRANSITIONS,
    LetterOfCredit,
    LetterOfCreditStatus,
    ProformaInvoice,
    ProformaInvoiceStatus,
    default_lc_document_checklist,
)


class TradeFinanceError(ERPError):
    default_code = "TRADE_FINANCE_ERROR"


def _transition_lc(lc: LetterOfCredit, new_status: str) -> LetterOfCredit:
    allowed = LC_TRANSITIONS.get(lc.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"Cannot transition LC from {lc.status} to {new_status}.",
            fields={"from": lc.status, "to": new_status},
        )
    lc.status = new_status
    lc.save(update_fields=["status", "updated_at"])
    return lc


def _po_line_total(po: PurchaseOrder) -> Decimal:
    total = Decimal("0")
    for line in PurchaseOrderLine.objects.filter(purchase_order=po):
        qty = _as_decimal(line.ordered_quantity)
        price = _as_decimal(line.unit_price)
        disc = _as_decimal(line.discount_pct) / Decimal("100")
        tax = _as_decimal(line.tax_pct) / Decimal("100")
        base = qty * price * (Decimal("1") - disc)
        total += base * (Decimal("1") + tax)
    return total.quantize(Decimal("0.0001"))


@transaction.atomic
def create_proforma_invoice(
    *,
    company,
    purchase_order: PurchaseOrder,
    user=None,
    **fields,
) -> ProformaInvoice:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "purchase_order", purchase_order)
    supplier = fields.pop("supplier", None) or purchase_order.supplier
    assert_related_same_company(company.id, "supplier", supplier)
    number = generate_document_number("PI")
    pi = ProformaInvoice.objects.create(
        company=company,
        document_number=number,
        purchase_order=purchase_order,
        supplier=supplier,
        status=fields.pop("status", ProformaInvoiceStatus.RECEIVED),
        created_by=user,
        updated_by=user,
        **{k: v for k, v in fields.items() if hasattr(ProformaInvoice, k)},
    )
    emit(
        "proforma.created",
        {"id": str(pi.id), "document_number": pi.document_number, "po": purchase_order.document_number},
    )
    return pi


@transaction.atomic
def create_letter_of_credit(
    *,
    company,
    purchase_order: PurchaseOrder,
    proforma_invoice: ProformaInvoice | None = None,
    user=None,
    **fields,
) -> LetterOfCredit:
    assert_company_allowed(user, company.id)
    assert_related_same_company(company.id, "purchase_order", purchase_order)
    if proforma_invoice is not None:
        assert_related_same_company(company.id, "proforma_invoice", proforma_invoice)
        if proforma_invoice.purchase_order_id != purchase_order.id:
            raise TradeFinanceError("Proforma Invoice must belong to the same Purchase Order.")
    supplier = fields.pop("supplier", None) or purchase_order.supplier
    assert_related_same_company(company.id, "supplier", supplier)
    amount = fields.pop("amount", None)
    if amount is None and proforma_invoice is not None:
        amount = proforma_invoice.total_amount
    if amount is None:
        amount = _po_line_total(purchase_order)
    currency = fields.pop("currency_code", None) or (
        proforma_invoice.currency_code if proforma_invoice else "USD"
    )
    number = generate_document_number("LC")
    lc = LetterOfCredit.objects.create(
        company=company,
        document_number=number,
        purchase_order=purchase_order,
        proforma_invoice=proforma_invoice,
        supplier=supplier,
        amount=_as_decimal(amount),
        currency_code=currency or "USD",
        document_checklist=fields.pop("document_checklist", None) or default_lc_document_checklist(),
        created_by=user,
        updated_by=user,
        **{k: v for k, v in fields.items() if hasattr(LetterOfCredit, k)},
    )
    emit("lc.created", {"id": str(lc.id), "document_number": lc.document_number})
    return lc


@transaction.atomic
def attach_draft_lc_scan(
    lc: LetterOfCredit,
    *,
    extracted: dict | None = None,
    draft_scan_url: str = "",
    user=None,
) -> LetterOfCredit:
    """Store Draft LC scan payload (OCR later). Moves DRAFT → DRAFT_LC_SCANNED."""
    if lc.status not in {
        LetterOfCreditStatus.DRAFT,
        LetterOfCreditStatus.AI_MATCH_FAILED,
        LetterOfCreditStatus.DRAFT_LC_SCANNED,
    }:
        raise TradeFinanceError(f"Cannot attach draft scan in status {lc.status}.")
    lc.draft_extracted = extracted or {}
    if draft_scan_url:
        lc.draft_scan_url = draft_scan_url
    lc.updated_by = user
    if lc.status == LetterOfCreditStatus.DRAFT:
        lc.status = LetterOfCreditStatus.DRAFT_LC_SCANNED
        lc.save(
            update_fields=[
                "draft_extracted",
                "draft_scan_url",
                "status",
                "updated_by",
                "updated_at",
            ]
        )
    elif lc.status == LetterOfCreditStatus.AI_MATCH_FAILED:
        lc.status = LetterOfCreditStatus.DRAFT_LC_SCANNED
        lc.save(
            update_fields=[
                "draft_extracted",
                "draft_scan_url",
                "status",
                "updated_by",
                "updated_at",
            ]
        )
    else:
        lc.save(update_fields=["draft_extracted", "draft_scan_url", "updated_by", "updated_at"])
    emit("lc.draft_scanned", {"id": str(lc.id)})
    return lc


@transaction.atomic
def run_draft_lc_match(lc: LetterOfCredit, *, user=None) -> LetterOfCredit:
    """
    Rules-based cross-match: Draft LC extracted fields vs PO + Proforma Invoice.
    (Client: AI reads Draft LC and matches PO / PI before Final LC.)
    """
    if lc.status not in {
        LetterOfCreditStatus.DRAFT_LC_SCANNED,
        LetterOfCreditStatus.AI_MATCH_FAILED,
        LetterOfCreditStatus.AI_MATCH_PASSED,
    }:
        raise TradeFinanceError(f"Cannot run match in status {lc.status}.")

    po = lc.purchase_order
    pi = lc.proforma_invoice
    extracted = lc.draft_extracted or {}
    issues: list[dict] = []

    po_total = _po_line_total(po)
    pi_amount = _as_decimal(pi.total_amount) if pi else None
    draft_amount = extracted.get("amount") or extracted.get("lc_amount")
    if draft_amount is not None:
        draft_amt = _as_decimal(draft_amount)
        if pi_amount is not None and abs(draft_amt - pi_amount) > Decimal("0.01"):
            issues.append(
                {
                    "field": "amount",
                    "message": f"Draft LC amount {draft_amt} does not match PI {pi_amount}.",
                }
            )
        elif po_total > 0 and abs(draft_amt - po_total) > max(Decimal("1"), po_total * Decimal("0.02")):
            # Only enforce PO total when lines exist; PI is primary when linked.
            if pi_amount is None:
                issues.append(
                    {
                        "field": "amount_vs_po",
                        "message": f"Draft LC amount {draft_amt} differs from PO total {po_total} beyond 2%.",
                    }
                )
    else:
        # No OCR amount yet — compare LC header amount to PI/PO
        if pi_amount is not None and abs(_as_decimal(lc.amount) - pi_amount) > Decimal("0.01"):
            issues.append(
                {
                    "field": "amount",
                    "message": f"LC amount {lc.amount} does not match PI {pi_amount}.",
                }
            )
        elif po_total > 0 and pi_amount is None:
            if abs(_as_decimal(lc.amount) - po_total) > max(Decimal("1"), po_total * Decimal("0.02")):
                issues.append(
                    {
                        "field": "amount_vs_po",
                        "message": f"LC amount {lc.amount} differs from PO total {po_total} beyond 2%.",
                    }
                )

    draft_currency = str(extracted.get("currency") or extracted.get("currency_code") or "").upper()
    if draft_currency:
        pi_cur = (pi.currency_code if pi else lc.currency_code or "").upper()
        if pi_cur and draft_currency != pi_cur:
            issues.append(
                {
                    "field": "currency",
                    "message": f"Draft LC currency {draft_currency} does not match PI/LC {pi_cur}.",
                }
            )

    draft_supplier = str(extracted.get("beneficiary") or extracted.get("supplier_name") or "").strip().lower()
    if draft_supplier and po.supplier:
        name = (getattr(po.supplier, "legal_name", None) or getattr(po.supplier, "trading_name", None) or "").strip().lower()
        if name and draft_supplier not in name and name not in draft_supplier:
            issues.append(
                {
                    "field": "beneficiary",
                    "message": "Draft LC beneficiary does not match PO supplier name.",
                }
            )

    if not pi:
        issues.append(
            {
                "field": "proforma_invoice",
                "message": "Link a Proforma Invoice before Final LC (required for PO+PI match).",
            }
        )

    passed = len(issues) == 0
    lc.match_result = {
        "passed": passed,
        "checked_at": timezone.now().isoformat(),
        "po_total": str(po_total),
        "pi_amount": str(pi_amount) if pi_amount is not None else None,
        "issues": issues,
        "engine": "rules_v1",  # upgrade to OCR/AI engine later
    }
    lc.updated_by = user
    target = LetterOfCreditStatus.AI_MATCH_PASSED if passed else LetterOfCreditStatus.AI_MATCH_FAILED

    if lc.status == target:
        lc.save(update_fields=["match_result", "updated_by", "updated_at"])
    elif lc.status == LetterOfCreditStatus.AI_MATCH_FAILED and passed:
        # Re-scan path: failed → scanned → passed
        if lc.status != LetterOfCreditStatus.DRAFT_LC_SCANNED:
            lc.status = LetterOfCreditStatus.DRAFT_LC_SCANNED
            lc.save(update_fields=["status", "match_result", "updated_by", "updated_at"])
        else:
            lc.save(update_fields=["match_result", "updated_by", "updated_at"])
        _transition_lc(lc, LetterOfCreditStatus.AI_MATCH_PASSED)
    elif lc.status == LetterOfCreditStatus.AI_MATCH_PASSED and not passed:
        lc.status = LetterOfCreditStatus.DRAFT_LC_SCANNED
        lc.save(update_fields=["status", "match_result", "updated_by", "updated_at"])
        _transition_lc(lc, LetterOfCreditStatus.AI_MATCH_FAILED)
    else:
        lc.save(update_fields=["match_result", "updated_by", "updated_at"])
        _transition_lc(lc, target)

    emit(
        "lc.draft_matched",
        {"id": str(lc.id), "passed": passed, "issues": len(issues)},
    )
    return lc


@transaction.atomic
def record_seller_draft_ok(lc: LetterOfCredit, *, note: str = "", user=None) -> LetterOfCredit:
    """Seller says: Yes, it is okay, you can proceed."""
    if lc.status != LetterOfCreditStatus.AI_MATCH_PASSED:
        raise TradeFinanceError("Seller can approve only after AI match passed.")
    lc.seller_approved_at = timezone.now()
    lc.seller_approval_note = note or "Yes, it is okay, you can proceed."
    lc.updated_by = user
    lc.save(update_fields=["seller_approved_at", "seller_approval_note", "updated_by", "updated_at"])
    _transition_lc(lc, LetterOfCreditStatus.SELLER_APPROVED)
    emit("lc.seller_approved", {"id": str(lc.id)})
    return lc


@transaction.atomic
def issue_final_lc(lc: LetterOfCredit, *, final_lc_number: str = "", user=None) -> LetterOfCredit:
    """Bank Final LC issued — send to seller; manufacturing may start."""
    if lc.status != LetterOfCreditStatus.SELLER_APPROVED:
        raise TradeFinanceError("Final LC only after seller approved the draft.")
    lc.final_issued_at = timezone.now()
    if final_lc_number:
        lc.final_lc_number = final_lc_number
        lc.lc_number = final_lc_number or lc.lc_number
    lc.updated_by = user
    lc.save(
        update_fields=[
            "final_issued_at",
            "final_lc_number",
            "lc_number",
            "updated_by",
            "updated_at",
        ]
    )
    _transition_lc(lc, LetterOfCreditStatus.FINAL_ISSUED)
    emit("lc.final_issued", {"id": str(lc.id), "final_lc_number": lc.final_lc_number})
    return lc


@transaction.atomic
def mark_manufacturing(lc: LetterOfCredit, *, user=None) -> LetterOfCredit:
    if lc.status != LetterOfCreditStatus.FINAL_ISSUED:
        raise TradeFinanceError("Manufacturing starts after Final LC.")
    lc.updated_by = user
    lc.save(update_fields=["updated_by", "updated_at"])
    _transition_lc(lc, LetterOfCreditStatus.MANUFACTURING)
    return lc


@transaction.atomic
def start_pre_dispatch_review(lc: LetterOfCredit, *, user=None) -> LetterOfCredit:
    if lc.status not in {
        LetterOfCreditStatus.FINAL_ISSUED,
        LetterOfCreditStatus.MANUFACTURING,
        LetterOfCreditStatus.DOCS_BLOCKED,
    }:
        raise TradeFinanceError(f"Cannot start pre-dispatch from {lc.status}.")
    if lc.status == LetterOfCreditStatus.DOCS_BLOCKED:
        _transition_lc(lc, LetterOfCreditStatus.DOCS_PENDING)
    elif lc.status in {
        LetterOfCreditStatus.FINAL_ISSUED,
        LetterOfCreditStatus.MANUFACTURING,
    }:
        _transition_lc(lc, LetterOfCreditStatus.DOCS_PENDING)
    lc.updated_by = user
    lc.save(update_fields=["updated_by", "updated_at"])
    return lc


@transaction.atomic
def verify_pre_dispatch_packet(
    lc: LetterOfCredit,
    *,
    present_keys: list[str] | None = None,
    user=None,
) -> LetterOfCredit:
    """
    AI/rules check: which required LC documents are present in the seller photo packet.
    Messages match client wording for customs (भन्सार) protection.
    """
    if lc.status not in {
        LetterOfCreditStatus.DOCS_PENDING,
        LetterOfCreditStatus.DOCS_BLOCKED,
        LetterOfCreditStatus.DOCS_CLEARED,
    }:
        if lc.status in {
            LetterOfCreditStatus.FINAL_ISSUED,
            LetterOfCreditStatus.MANUFACTURING,
        }:
            start_pre_dispatch_review(lc, user=user)
            lc.refresh_from_db()
        else:
            raise TradeFinanceError(f"Cannot verify pre-dispatch in status {lc.status}.")

    checklist = lc.document_checklist or default_lc_document_checklist()
    items = list(checklist.get("items") or [])
    present = set(present_keys or [])
    # Also treat confirmed/file_url as present
    for item in items:
        key = item.get("key")
        if item.get("present_in_packet") or item.get("confirmed") or item.get("file_url"):
            if key:
                present.add(key)
        if key in present:
            item["present_in_packet"] = True

    missing = [
        item["label"]
        for item in items
        if item.get("required") and item.get("key") not in present
    ]
    lc.document_checklist = {"items": items}

    if missing:
        lc.pre_dispatch_message = (
            "These are the documents left out as per LC: " + "; ".join(missing) + "."
        )
        lc.updated_by = user
        lc.save(update_fields=["document_checklist", "pre_dispatch_message", "updated_by", "updated_at"])
        if lc.status != LetterOfCreditStatus.DOCS_BLOCKED:
            if lc.status == LetterOfCreditStatus.DOCS_CLEARED:
                # allow re-check — force via pending first is awkward; set directly with care
                lc.status = LetterOfCreditStatus.DOCS_PENDING
                lc.save(update_fields=["status", "updated_at"])
            _transition_lc(lc, LetterOfCreditStatus.DOCS_BLOCKED)
        emit("lc.pre_dispatch_blocked", {"id": str(lc.id), "missing": missing})
    else:
        lc.pre_dispatch_message = (
            "Yes, it is okay, you can dispatch the material along with these documents."
        )
        lc.updated_by = user
        lc.save(update_fields=["document_checklist", "pre_dispatch_message", "updated_by", "updated_at"])
        if lc.status != LetterOfCreditStatus.DOCS_CLEARED:
            if lc.status == LetterOfCreditStatus.DOCS_BLOCKED:
                _transition_lc(lc, LetterOfCreditStatus.DOCS_PENDING)
                lc.refresh_from_db()
            _transition_lc(lc, LetterOfCreditStatus.DOCS_CLEARED)
        emit("lc.pre_dispatch_cleared", {"id": str(lc.id)})
    return lc


def lc_allows_gate_entry(lc: LetterOfCredit | None) -> tuple[bool, str]:
    """Policy helper: Gate/GRN should wait until pre-dispatch cleared for LC-linked POs."""
    if lc is None:
        return True, ""
    if lc.status == LetterOfCreditStatus.DOCS_CLEARED:
        return True, lc.pre_dispatch_message or "Pre-dispatch cleared."
    if lc.status in {
        LetterOfCreditStatus.CLOSED,
        LetterOfCreditStatus.CANCELLED,
    }:
        return False, f"LC is {lc.status}."
    return False, lc.pre_dispatch_message or (
        "Pre-dispatch documents not cleared as per LC. Do not accept at gate until AI/checklist passes."
    )


def active_lc_for_po(po) -> LetterOfCredit | None:
    """Latest non-cancelled LC for a purchase order, or None if domestic / no LC."""
    if po is None:
        return None
    po_id = getattr(po, "pk", po)
    if not po_id:
        return None
    return (
        LetterOfCredit.objects.filter(purchase_order_id=po_id)
        .exclude(status=LetterOfCreditStatus.CANCELLED)
        .order_by("-created_at")
        .first()
    )


def lc_inbound_status_for_po(po) -> dict:
    """Read-only payload for Gate/GRN serializers and UI banners."""
    lc = active_lc_for_po(po)
    ok, msg = lc_allows_gate_entry(lc)
    return {
        "lc_gate_allowed": ok,
        "lc_gate_message": msg,
        "lc_id": str(lc.id) if lc else None,
        "lc_document_number": lc.document_number if lc else None,
        "lc_status": lc.status if lc else None,
    }


def assert_lc_allows_inbound(po) -> None:
    """
    Raise TradeFinanceError when policy blocks Gate/GRN for an LC-linked PO.
    No-op when policy off, no PO, or no active LC.
    """
    from apps.core.phase3_policy import BLOCK_GATE_IF_LC_DOCS_NOT_CLEARED

    if not BLOCK_GATE_IF_LC_DOCS_NOT_CLEARED:
        return
    lc = active_lc_for_po(po)
    if lc is None:
        return
    ok, msg = lc_allows_gate_entry(lc)
    if not ok:
        raise TradeFinanceError(
            msg or "LC pre-dispatch not cleared — Gate/GRN blocked.",
            code="LC_GATE_BLOCKED",
            fields={
                "lc_id": str(lc.id),
                "lc_document_number": lc.document_number,
                "lc_status": lc.status,
            },
        )
