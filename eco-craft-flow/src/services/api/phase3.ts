/**
 * Phase 3 Slice A/B — typed commercial document API paths.
 * DomainRecord routes remain for list UI compatibility.
 * Stock / reservation / 3-way match authority lives on the server — never DomainRecord JSON.
 */
import { API_V1 } from "./endpoints";
import { apiFetch } from "./client";

export const PHASE3_TYPED_API = {
  purchaseOrders: `${API_V1}/purchase/purchase-orders/`,
  purchaseOrdersSummary: `${API_V1}/purchase/purchase-orders/summary/`,
  purchaseOrderSubmit: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/submit/`,
  purchaseOrderApprove: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/approve/`,
  purchaseOrderCancel: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/cancel/`,
  purchaseOrderMarkSent: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/mark-sent/`,
  purchaseOrderClose: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/close/`,
  purchaseOrderAmend: (id: string) => `${API_V1}/purchase/purchase-orders/${id}/amend/`,
  purchaseOrderCancelLine: (id: string, lineId: string) =>
    `${API_V1}/purchase/purchase-orders/${id}/lines/${lineId}/cancel-remaining/`,

  supplierBills: `${API_V1}/purchase/supplier-bills/`,
  supplierBillMatch: (id: string) => `${API_V1}/purchase/supplier-bills/${id}/match/`,
  supplierBillApproveForAp: (id: string) => `${API_V1}/purchase/supplier-bills/${id}/approve-for-ap/`,
  supplierBillPost: (id: string) => `${API_V1}/purchase/supplier-bills/${id}/post/`,

  proformaInvoices: `${API_V1}/purchase/proforma-invoices/`,
  lettersOfCredit: `${API_V1}/purchase/letters-of-credit/`,
  lcScanDraft: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/scan-draft/`,
  lcAiScanDraft: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/ai-scan-draft/`,
  lcAiSuggestPreDispatch: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/ai-suggest-pre-dispatch/`,
  lcRunMatch: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/run-match/`,
  lcSellerOk: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/seller-ok/`,
  lcIssueFinal: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/issue-final/`,
  lcMarkManufacturing: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/mark-manufacturing/`,
  lcStartPreDispatch: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/start-pre-dispatch/`,
  lcVerifyPreDispatch: (id: string) => `${API_V1}/purchase/letters-of-credit/${id}/verify-pre-dispatch/`,

  salesOrders: `${API_V1}/sales/sales-orders/`,
  salesOrdersSummary: `${API_V1}/sales/sales-orders/summary/`,
  salesOrderConfirm: (id: string) => `${API_V1}/sales/sales-orders/${id}/confirm/`,
  salesOrderCancel: (id: string) => `${API_V1}/sales/sales-orders/${id}/cancel/`,
  salesOrderReleaseReservations: (id: string) =>
    `${API_V1}/sales/sales-orders/${id}/release-reservations/`,
  salesOrderSetFulfillment: (id: string) => `${API_V1}/sales/sales-orders/${id}/set-fulfillment/`,
  salesOrderCancelLine: (id: string, lineId: string) =>
    `${API_V1}/sales/sales-orders/${id}/lines/${lineId}/cancel/`,

  dispatchNotes: `${API_V1}/sales/dispatch-notes/`,
  dispatchNotePost: (id: string) => `${API_V1}/sales/dispatch-notes/${id}/post/`,

  salesInvoices: `${API_V1}/sales/sales-invoices/`,
  salesInvoicePost: (id: string) => `${API_V1}/sales/sales-invoices/${id}/post/`,
  salesInvoiceCancel: (id: string) => `${API_V1}/sales/sales-invoices/${id}/cancel/`,

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
  commercials_frozen?: boolean;
  exchange_rate?: string;
  discount_amount?: string;
  total?: string;
};

export type SalesOrderDto = {
  id: string;
  document_number: string;
  status: string;
  pick_status?: string;
  pack_status?: string;
  promised_delivery_date?: string | null;
  credit_warning?: string;
  lines?: Array<{
    id: string;
    ordered_quantity: string;
    reserved_quantity: string;
    dispatched_quantity: string;
    cancelled_quantity?: string;
  }>;
};

export type PurchaseOrderDto = {
  id: string;
  document_number: string;
  status: string;
  revision_no?: number;
};

/** Confirm typed SO — server runs reserve_stock + StockReservationAllocation. */
export function confirmSalesOrder(id: string) {
  return apiFetch<SalesOrderDto>(PHASE3_TYPED_API.salesOrderConfirm(id), {
    method: "POST",
    silent: true,
  });
}

export function releaseSalesOrderReservations(id: string) {
  return apiFetch<SalesOrderDto>(PHASE3_TYPED_API.salesOrderReleaseReservations(id), {
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

export function approveSupplierBillForAp(id: string) {
  return apiFetch<SupplierBillDto>(PHASE3_TYPED_API.supplierBillApproveForAp(id), {
    method: "POST",
    silent: true,
  });
}

export function approvePurchaseOrder(id: string) {
  return apiFetch(PHASE3_TYPED_API.purchaseOrderApprove(id), { method: "POST", silent: true });
}

export function markPurchaseOrderSent(id: string) {
  return apiFetch<PurchaseOrderDto>(PHASE3_TYPED_API.purchaseOrderMarkSent(id), {
    method: "POST",
    silent: true,
  });
}

export function closePurchaseOrder(id: string) {
  return apiFetch<PurchaseOrderDto>(PHASE3_TYPED_API.purchaseOrderClose(id), {
    method: "POST",
    silent: true,
  });
}

export function amendPurchaseOrder(
  id: string,
  body: {
    expected_delivery_date?: string | null;
    notes?: string;
    line_updates?: Array<{
      line_id: string;
      unit_price?: string | number;
      ordered_quantity?: string | number;
      notes?: string;
    }>;
  },
) {
  return apiFetch<PurchaseOrderDto>(PHASE3_TYPED_API.purchaseOrderAmend(id), {
    method: "POST",
    body,
    silent: true,
  });
}

export function cancelPurchaseOrderLine(poId: string, lineId: string, quantity?: string | number) {
  return apiFetch(PHASE3_TYPED_API.purchaseOrderCancelLine(poId, lineId), {
    method: "POST",
    body: quantity != null ? { quantity } : {},
    silent: true,
  });
}

export function cancelSalesOrderLine(soId: string, lineId: string, quantity?: string | number) {
  return apiFetch(PHASE3_TYPED_API.salesOrderCancelLine(soId, lineId), {
    method: "POST",
    body: quantity != null ? { quantity } : {},
    silent: true,
  });
}

export function setSalesOrderFulfillment(
  id: string,
  body: {
    pick_status?: string;
    pack_status?: string;
    promised_delivery_date?: string | null;
  },
) {
  return apiFetch<SalesOrderDto>(PHASE3_TYPED_API.salesOrderSetFulfillment(id), {
    method: "POST",
    body,
    silent: true,
  });
}

export function postDispatchNote(id: string) {
  return apiFetch(PHASE3_TYPED_API.dispatchNotePost(id), { method: "POST", silent: true });
}

export function postSalesInvoice(id: string) {
  return apiFetch(PHASE3_TYPED_API.salesInvoicePost(id), { method: "POST", silent: true });
}

export function cancelSalesInvoice(id: string) {
  return apiFetch(PHASE3_TYPED_API.salesInvoiceCancel(id), { method: "POST", silent: true });
}

export type LetterOfCreditDto = {
  id: string;
  document_number?: string;
  status?: string;
  purchase_order?: string;
  proforma_invoice?: string | null;
  bank_name?: string;
  amount?: string;
  currency_code?: string;
  draft_extracted?: Record<string, unknown>;
  match_result?: Record<string, unknown>;
  pre_dispatch_message?: string;
  document_checklist?: { items?: Array<Record<string, unknown>> };
  gate_allowed?: boolean;
  gate_message?: string;
};

export function lcScanDraft(id: string, body: Record<string, unknown>) {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcScanDraft(id), {
    method: "POST",
    body,
    silent: true,
  });
}

export function lcAiScanDraft(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcAiScanDraft(id), {
    method: "POST",
    body: form,
    silent: true,
  });
}

export type PreDispatchSuggestion = {
  present_keys?: string[];
  missing_keys?: string[];
  confidence?: number;
  summary?: string;
  gemini_configured?: boolean;
  gemini_model?: string | null;
};

export function lcAiSuggestPreDispatch(id: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return apiFetch<PreDispatchSuggestion>(PHASE3_TYPED_API.lcAiSuggestPreDispatch(id), {
    method: "POST",
    body: form,
    silent: true,
  });
}

export function lcRunMatch(id: string) {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcRunMatch(id), { method: "POST", silent: true });
}

export function lcSellerOk(id: string, note = "") {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcSellerOk(id), {
    method: "POST",
    body: { note },
    silent: true,
  });
}

export function lcIssueFinal(id: string, finalLcNumber = "") {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcIssueFinal(id), {
    method: "POST",
    body: { final_lc_number: finalLcNumber },
    silent: true,
  });
}

export function lcMarkManufacturing(id: string) {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcMarkManufacturing(id), {
    method: "POST",
    silent: true,
  });
}

export function lcStartPreDispatch(id: string) {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcStartPreDispatch(id), {
    method: "POST",
    silent: true,
  });
}

export function lcVerifyPreDispatch(id: string, presentKeys: string[]) {
  return apiFetch<LetterOfCreditDto>(PHASE3_TYPED_API.lcVerifyPreDispatch(id), {
    method: "POST",
    body: { present_keys: presentKeys },
    silent: true,
  });
}
