"""Phase 2 domain events — lightweight in-process emit (Celery-ready later)."""

from __future__ import annotations

import logging

logger = logging.getLogger("apps.events")


def emit(event_name: str, payload: dict | None = None) -> None:
    """Emit a domain event inside the caller's transaction (no Kafka)."""
    logger.info("domain_event=%s payload=%s", event_name, payload or {})


# Event name constants
GRN_POSTED = "GRNPosted"
QC_PASSED = "QCInspectionPassed"
QC_FAILED = "QCInspectionFailed"
PUTAWAY_COMPLETED = "PutawayCompleted"
STOCK_ADJUSTED = "StockAdjusted"
STOCK_TRANSFERRED = "StockTransferred"
STOCK_RESERVED = "StockReserved"
RESERVATION_RELEASED = "ReservationReleased"
LANDED_COST_POSTED = "LandedCostPosted"
