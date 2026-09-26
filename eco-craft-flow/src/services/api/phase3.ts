/**
 * Phase 3 Slice A — typed commercial document API paths.
 * DomainRecord routes remain for list UI compatibility.
 * Stock / reservation / 3-way match authority lives on the server — never DomainRecord JSON.
 */
import { API_V1 } from "./endpoints";
import { apiFetch } from "./client";

export const PHASE3_TYPED_API = {
  purchaseOrders: `${API_V1}/purchase/purchase-orders/`,
  purchaseOrderSubmit: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/submit/`,
  purchaseOrderApprove: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/approve/`,
  purchaseOrderCancel: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/cancel/`,

  supplierBills: `${API_V1}/purchase/supplier-bills/`,
  supplierBillMatch: (id: string) => `${API_V1}/purchase/supplier-bills/${id}/match/`,
  supplierBillPost: (id: string) => `${API_V1}/purchase/supplier-bills/${id}/post/`,

  salesOrders: `${API_V1}/sales/sales-orders/`,
  salesOrderConfirm: (id: string) => `${API_V1}/sales/sales-orders/${id}/confirm/`,
  salesOrderCancel: (id: string) => `${API_V1}/sales/sales-orders/${id}/cancel/`,
  salesOrderReleaseReservations: (id: string) =>
    `${API_V1}/sales/sales-orders/${id}/release-reservations/`,

  dispatchNotes: `${API_V1}/sales/dispatch-notes/`,
  dispatchNotePost: (id: string) => `${API_V1}/sales/dispatch-notes/${id}/post/`,

  salesInvoices: `${API_V1}/sales/sales-invoices/`,
  salesInvoicePost: (id: string) => `${API_V1}/sales/sales-invoices/${id}/post/`,

  /** Prefer Phase 2 balances over DomainRecord products.onHand / reserved. */
  balances: `${API_V1}/inventory/balances/`,
} as const;

export type Phase3MatchStatus = "UNMATCHED" | "MATCHED" | "TOLERANCE_MATCHED" | "MISMATCHED";

export type SupplierBillDto = {
  id: string;
  document_number: string;
  match_status: Phase3MatchStatus;
  match_exceptions: string;
  status: string;
  total?: string;
};

export type SalesOrderDto = {
  id: string;
  document_number: string;
  status: string;
  credit_warning?: string;
  lines?: Array<{
    id: string;
    ordered_quantity: string;
    reserved_quantity: string;
    dispatched_quantity: string;
  }>;
};

/** Confirm typed SO — server runs reserve_stock + StockReservationAllocation. */
export function confirmSalesOrder(id: string) {
  return apiFetch<SalesOrderDto>(PHASE3_TYPED_API.salesOrderConfirm(id), {
    method: "POST",
    silent: true,
  });
}

/** Server-authoritative 3-way match. Client threeWayMatch() is display-only. */
export function matchSupplierBill(id: string) {
  return apiFetch<SupplierBillDto>(PHASE3_TYPED_API.supplierBillMatch(id), {
    method: "POST",
    silent: true,
  });
}

export function approvePurchaseOrder(id: string) {
  return apiFetch(PHASE3_TYPED_API.purchaseOrderApprove(id), { method: "POST", silent: true });
}

export function postDispatchNote(id: string) {
  return apiFetch(PHASE3_TYPED_API.dispatchNotePost(id), { method: "POST", silent: true });
}

export function postSalesInvoice(id: string) {
  return apiFetch(PHASE3_TYPED_API.salesInvoicePost(id), { method: "POST", silent: true });
}
