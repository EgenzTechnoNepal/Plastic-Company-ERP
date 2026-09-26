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

# Phase 3 Slice A
PURCHASE_ORDER_APPROVED = "PurchaseOrderApproved"
PURCHASE_ORDER_CANCELLED = "PurchaseOrderCancelled"
PURCHASE_ORDER_RECEIPT_PROGRESS = "PurchaseOrderReceiptProgress"
SALES_ORDER_CONFIRMED = "SalesOrderConfirmed"
SALES_ORDER_CANCELLED = "SalesOrderCancelled"
DISPATCH_POSTED = "DispatchPosted"
SUPPLIER_BILL_MATCHED = "SupplierBillMatched"
SUPPLIER_BILL_MISMATCHED = "SupplierBillMismatched"
SALES_INVOICE_POSTED = "SalesInvoicePosted"
