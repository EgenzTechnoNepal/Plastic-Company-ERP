"""
Phase 3 Slice A — configurable commercial policy defaults.

These are NOT hardcoded EcoWrap business law. Override per company later via
settings / CompanyCommercialPolicy when the client confirms workshop answers.
"""

from __future__ import annotations

from decimal import Decimal

# 1. Partial SO confirm when ATC short → reject entire confirm (default)
ALLOW_PARTIAL_SO_CONFIRM = False

# 2. PO over-receipt tolerance (% of ordered qty)
PO_OVER_RECEIPT_TOLERANCE_PCT = Decimal("2")

# 3-way match qty/amount tolerance (%)
THREE_WAY_MATCH_TOLERANCE_PCT = Decimal("2")

# 3. Non-PO GRNs remain allowed
REQUIRE_PO_ON_GRN = False

# 4. Invoice before dispatch prohibited
ALLOW_INVOICE_BEFORE_DISPATCH = False

# 7. Credit limit hard block (default warning only)
CREDIT_LIMIT_HARD_BLOCK = False

# Reservation reference for SO lines
SO_LINE_RESERVATION_REF = "SALES_ORDER_LINE"


def over_receipt_allowed(ordered: Decimal, already_received: Decimal, incoming: Decimal) -> bool:
    """True if incoming accepted qty stays within ordered + tolerance."""
    ordered = Decimal(str(ordered))
    already = Decimal(str(already_received))
    incoming = Decimal(str(incoming))
    if ordered <= 0:
        return incoming <= 0
    tolerance = (ordered * PO_OVER_RECEIPT_TOLERANCE_PCT / Decimal("100")).quantize(Decimal("0.000001"))
    return (already + incoming) <= (ordered + tolerance)


def match_within_tolerance(a: Decimal, b: Decimal, *, base: Decimal | None = None) -> bool:
    a = Decimal(str(a))
    b = Decimal(str(b))
    ref = abs(base if base is not None else max(a, b, Decimal("1")))
    tol = (ref * THREE_WAY_MATCH_TOLERANCE_PCT / Decimal("100")).quantize(Decimal("0.000001"))
    return abs(a - b) <= tol
