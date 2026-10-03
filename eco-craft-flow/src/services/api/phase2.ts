/**
 * Phase 2 typed inventory/warehouse engine API paths.
 * DomainRecord routes remain for list UI compatibility.
 * Stock quantities must come from balances / stock-ledger — not DomainRecord JSON.
 */
import { API_V1 } from "./endpoints";
import { apiFetch } from "./client";

export const PHASE2_TYPED_API = {
  importShipments: `${API_V1}/purchase/import-shipments/`,
  inboundGates: `${API_V1}/purchase/inbound-gates/`,
  gateSubmit: (id: string) => `${API_V1}/purchase/inbound-gates/${id}/submit/`,
  gateCancel: (id: string) => `${API_V1}/purchase/inbound-gates/${id}/cancel/`,
  goodsReceipts: `${API_V1}/purchase/goods-receipts/`,
  grnPost: (id: string) => `${API_V1}/purchase/goods-receipts/${id}/post/`,
  lotInspections: `${API_V1}/quality/lot-inspections/`,
  qcPass: (id: string) => `${API_V1}/quality/lot-inspections/${id}/pass/`,
  qcFail: (id: string) => `${API_V1}/quality/lot-inspections/${id}/fail/`,
  qcDispose: (id: string) => `${API_V1}/quality/lot-inspections/${id}/dispose/`,
  qcReinspect: `${API_V1}/quality/lot-inspections/reinspect/`,
  qcPatch: (id: string) => `${API_V1}/quality/lot-inspections/${id}/`,
  stockLedger: `${API_V1}/inventory/stock-ledger/`,
  balances: `${API_V1}/inventory/balances/`,
  fifoIssue: `${API_V1}/inventory/fifo-issue/`,
  reservations: `${API_V1}/inventory/reservations/`,
  reservationRelease: (id: string) => `${API_V1}/inventory/reservations/${id}/release/`,
  landedCostPost: (id: string) => `${API_V1}/inventory/landed-cost-documents/${id}/post/`,
  landedCostAdjust: (id: string) => `${API_V1}/inventory/landed-cost-documents/${id}/adjust/`,
  putaways: `${API_V1}/warehouse/putaways/`,
  putawayPost: (id: string) => `${API_V1}/warehouse/putaways/${id}/post/`,
  transfersV2: `${API_V1}/warehouse/stock-transfers-v2/`,
  adjustmentsV2: `${API_V1}/warehouse/stock-adjustments-v2/`,
  cycleCountsV2: `${API_V1}/warehouse/cycle-counts-v2/`,
} as const;

export type QCInspectionDto = {
  id: string;
  inspection_number?: string;
  status?: string;
  lot?: string;
  item?: string;
  grn?: string | null;
  remarks?: string;
  fail_disposition?: string;
  coa_reference?: string;
  coa_attachment_url?: string;
  metrics?: Record<string, unknown>;
  ncr_reference?: string;
};

export function qcPassInspection(id: string, body: Record<string, unknown> = {}) {
  return apiFetch<QCInspectionDto>(PHASE2_TYPED_API.qcPass(id), {
    method: "POST",
    body,
    silent: true,
  });
}

export function qcFailInspection(id: string, disposition = "QUARANTINED") {
  return apiFetch<QCInspectionDto>(PHASE2_TYPED_API.qcFail(id), {
    method: "POST",
    body: { disposition },
    silent: true,
  });
}

export type DisposeResult = {
  action?: string;
  lot_id?: string;
  lot_number?: string;
  lot_status?: string;
  qty_written_off?: string;
  adjustments?: string[];
  ncr?: string | null;
  purchase_return?: string;
  debit_note?: string;
  amount?: string;
};

export function qcDisposeInspection(id: string, action: "RETURN" | "SCRAP", remarks = "") {
  return apiFetch<DisposeResult>(PHASE2_TYPED_API.qcDispose(id), {
    method: "POST",
    body: { action, remarks },
    silent: true,
  });
}

export function qcPatchInspection(id: string, body: Record<string, unknown>) {
  return apiFetch<QCInspectionDto>(PHASE2_TYPED_API.qcPatch(id), {
    method: "PATCH",
    body,
    silent: true,
  });
}
