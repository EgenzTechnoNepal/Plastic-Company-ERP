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

# Phase 3 Slice B MUST
PURCHASE_ORDER_SENT = "PurchaseOrderSent"
PURCHASE_ORDER_CLOSED = "PurchaseOrderClosed"
PURCHASE_ORDER_AMENDED = "PurchaseOrderAmended"
PURCHASE_ORDER_LINE_CANCELLED = "PurchaseOrderLineCancelled"
SALES_ORDER_LINE_CANCELLED = "SalesOrderLineCancelled"
SUPPLIER_BILL_APPROVED_FOR_AP = "SupplierBillApprovedForAp"

# Phase B — CRM / Approvals
CUSTOMER_CREATED = "CustomerCreated"
CUSTOMER_UPDATED = "CustomerUpdated"
CONTACT_CREATED = "ContactCreated"
CRM_ACTIVITY_CREATED = "CRMActivityCreated"
SUPPLIER_UPDATED = "SupplierUpdated"
APPROVAL_REQUESTED = "ApprovalRequested"
APPROVAL_APPROVED = "ApprovalApproved"
APPROVAL_REJECTED = "ApprovalRejected"
APPROVAL_CANCELLED = "ApprovalCancelled"

# Phase 3 — Production / BOM
MATERIAL_ISSUED = "MaterialIssued"
PRODUCTION_OUTPUT_POSTED = "ProductionOutputPosted"