/**
 * Inbound journey (PO → PI/LC → Gate → GRN → QC → Landed cost → Putaway).
 * The server builds the read model and decides which actions are allowed; the UI only renders and calls.
 */
import { useQuery } from "@tanstack/react-query";
import { API_V1 } from "./endpoints";
import { apiFetch } from "./client";
import { PHASE2_TYPED_API } from "./phase2";

export type JourneyBin = { id: string; code: string; type: string; name: string };

export type JourneyPoLine = {
  id: string;
  line_no: number;
  item_sku: string;
  item_name: string;
  qc_required: boolean;
  uom: string;
  ordered_quantity: string;
  received_quantity: string;
  remaining_receivable: string;
  unit_price: string;
  discount_pct: string;
  tax_pct: string;
  line_total: string;
};

export type JourneyChecklistItem = {
  key: string;
  label: string;
  required?: boolean;
  confirmed?: boolean;
  present_in_packet?: boolean;
};

export type JourneyLedgerEntry = {
  occurred_at: string;
  txn_type: string;
  quantity_in: string;
  quantity_out: string;
  bin: string | null;
  unit_cost: string;
  reason: string;
  is_state_event: boolean;
};

export type JourneyLandedDoc = {
  id: string;
  number: string;
  status: string;
  purchase_quantity: string;
  purchase_unit_cost: string;
  purchase_value: string;
  additional_total: string;
  landed_total: string;
  components: Array<{ category: string; label: string; description: string; amount: string }>;
};

export type JourneyLot = {
  id: string;
  lot_number: string;
  status: string;
  qc_status: string;
  item_sku: string;
  item_name: string;
  warehouse: string | null;
  bin: JourneyBin | null;
  uom: string;
  initial_quantity: string;
  remaining_quantity: string;
  purchase_unit_cost: string;
  landed_unit_cost: string | null;
  purchase_value: string;
  landed_value: string | null;
  inspections: Array<{
    id: string;
    number: string;
    status: string;
    fail_disposition: string;
    ncr_reference: string;
    coa_reference: string;
    remarks: string;
    inspected_at: string | null;
  }>;
  landed_costs: JourneyLandedDoc[];
  putaways: Array<{ number: string; status: string; from_bin: string | null; to_bin: string; quantity: string }>;
  ledger: JourneyLedgerEntry[];
  actions: { qc_inspection_id: string | null; can_landed_cost: boolean; can_putaway: boolean };
};

export type InboundJourney = {
  purchase_order: {
    id: string;
    document_number: string;
    status: string;
    supplier: { id: string; code: string; name: string; country: string };
    currency: string;
    payment_terms: string;
    incoterm: string;
    named_place: string;
    destination_warehouse: string | null;
    expected_delivery_date: string | null;
    lines: JourneyPoLine[];
    subtotal: string;
    tax_total: string;
    total: string;
  };
  proforma_invoices: Array<{
    id: string;
    number: string;
    status: string;
    seller_pi_number: string;
    currency_code: string;
    total_amount: string;
    payment_terms: string;
    lead_time_days: number | null;
  }>;
  letter_of_credit: null | {
    id: string;
    number: string;
    status: string;
    status_label: string;
    bank_name: string;
    final_lc_number: string;
    currency_code: string;
    amount: string;
    match: {
      engine: string;
      engine_kind: string;
      passed: boolean | null;
      checked_at: string | null;
      po_total: string | null;
      pi_amount: string | null;
      issues: unknown[];
    };
    checklist: JourneyChecklistItem[];
    pre_dispatch_message: string;
  };
  lc_gate: {
    lc_gate_allowed: boolean;
    lc_gate_message: string;
    lc_id: string | null;
    lc_document_number: string | null;
    lc_status: string | null;
  };
  gates: Array<{
    id: string;
    number: string;
    status: string;
    vehicle_number: string;
    driver_name: string;
    entry_at: string | null;
  }>;
  grns: Array<{
    id: string;
    number: string;
    status: string;
    gate_number: string | null;
    warehouse: string | null;
    receiving_bin: JourneyBin | null;
    posted_at: string | null;
    lines: Array<{
      item_sku: string;
      received_quantity: string;
      accepted_quantity: string;
      rejected_quantity: string;
      purchase_unit_cost: string;
      lot_number: string;
    }>;
  }>;
  lots: JourneyLot[];
  putaway_bins: JourneyBin[];
  landed_cost_categories: Array<{ value: string; label: string }>;
  actions: {
    can_record_gate: boolean;
    gate_blocked_by_lc: boolean;
    gate_blocked_reason: string;
    receivable_gate_ids: string[];
  };
};

export const INBOUND_API = {
  journey: (poId: string) => `${API_V1}/purchase/purchase-orders/${poId}/inbound-journey/`,
  recordGate: `${API_V1}/purchase/inbound-gates/record/`,
  receiveGate: (gateId: string) => `${API_V1}/purchase/inbound-gates/${gateId}/receive/`,
  lotLandedCost: (lotId: string) => `${API_V1}/inventory/lots/${lotId}/landed-cost/`,
  putawayForLot: `${API_V1}/warehouse/putaways/for-lot/`,
} as const;

export const inboundJourneyKey = (poId: string) => ["inbound-journey", poId] as const;

export function useInboundJourney(poId: string | undefined) {
  return useQuery({
    queryKey: inboundJourneyKey(poId ?? ""),
    queryFn: () => apiFetch<InboundJourney>(INBOUND_API.journey(poId!), { silent: true }),
    enabled: Boolean(poId),
  });
}

export function recordGateEntry(body: {
  purchase_order: string;
  vehicle_number: string;
  driver_name?: string;
  remarks?: string;
}) {
  return apiFetch<{ id: string; gate_entry_number: string }>(INBOUND_API.recordGate, {
    method: "POST",
    body,
    silent: true,
  });
}

export function receiveAgainstGate(
  gateId: string,
  lines: Array<{ purchase_order_line: string; accepted_quantity: string; rejected_quantity?: string }>,
) {
  return apiFetch<{ id: string; grn_number: string }>(INBOUND_API.receiveGate(gateId), {
    method: "POST",
    body: { lines },
    silent: true,
  });
}

export function postLotLandedCost(
  lotId: string,
  components: Array<{ category: string; amount: string; description?: string }>,
) {
  return apiFetch<{ document_number: string; landed_unit_cost: string; landed_total: string }>(
    INBOUND_API.lotLandedCost(lotId),
    { method: "POST", body: { components }, silent: true },
  );
}

export function putawayLot(lotId: string, toBinId: string) {
  return apiFetch<{ putaway_number: string }>(INBOUND_API.putawayForLot, {
    method: "POST",
    body: { lot: lotId, to_bin: toBinId },
    silent: true,
  });
}

export function qcFailLot(inspectionId: string, disposition: "QUARANTINED" | "REJECTED") {
  return apiFetch(PHASE2_TYPED_API.qcFail(inspectionId), {
    method: "POST",
    body: { disposition },
    silent: true,
  });
}
