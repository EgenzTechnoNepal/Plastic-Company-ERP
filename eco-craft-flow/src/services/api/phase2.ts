/**
 * Phase 2 typed inventory/warehouse engine API paths.
 * DomainRecord routes remain for list UI compatibility.
 * Stock quantities must come from balances / stock-ledger — not DomainRecord JSON.
 */
import { API_V1 } from "./endpoints";

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
