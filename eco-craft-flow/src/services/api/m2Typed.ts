/**
 * Milestone 2 P0 — typed API → ErpRecord adapters for the demo journey.
 * DomainRecord routes remain for non-demo modules.
 */
import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta } from "./client";
import type { DocStatus, ErpRecord, LineItem } from "@/types/erp";
import { PHASE2_TYPED_API } from "./phase2";
import { PHASE3_TYPED_API } from "./phase3";

/** Entities that must not silently fall back to mock/localStorage in live sessions. */
export const M2_DEMO_TYPED_ENTITIES = new Set([
  "suppliers",
  "products",
  "warehouses",
  "bins",
  "purchase_orders",
  "gate_entries",
  "grns",
  "purchase_bills",
  "sales_orders",
  "deliveries",
  "invoices",
  "qc_inspections",
  "stock_movements",
  "customers",
  "contacts",
  "activities",
]);

export const M2_TYPED_PATHS = {
  vendors: `${API_V1}/purchase/vendors/`,
  items: `${API_V1}/inventory/items/`,
  facilities: `${API_V1}/warehouse/facilities/`,
  storageBins: `${API_V1}/warehouse/storage-bins/`,
  lots: `${API_V1}/inventory/lots/`,
  landedDocs: `${API_V1}/inventory/landed-cost-documents/`,
} as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function statusMap(raw: string | undefined): DocStatus {
  const s = (raw ?? "draft").toLowerCase();
  if (s === "available" || s === "posted" || s === "approved" || s === "sent" || s === "matched" || s === "passed" || s === "received" || s === "active") {
    return "posted" as DocStatus;
  }
  if (s === "cancelled" || s === "rejected" || s === "failed") return "cancelled" as DocStatus;
  if (s === "reserved" || s === "submitted" || s === "pending" || s === "qc_hold" || s.includes("partial")) {
    return "submitted" as DocStatus;
  }
  return (s as DocStatus) || "draft";
}

async function listRows<T>(path: string): Promise<T[]> {
  const { data } = await apiFetchMeta<T[]>(path, { query: { page_size: 200 }, silent: true });
  return Array.isArray(data) ? data : [];
}

function baseRecord(
  entity: string,
  id: string,
  code: string,
  title: string,
  status: string,
  fields: Record<string, unknown>,
  lines: LineItem[] = [],
  created = "",
  updated = "",
): ErpRecord {
  return {
    id,
    entity,
    code,
    title,
    date: (created || today()).slice(0, 10),
    status: statusMap(status),
    fields: { ...fields, typedId: id },
    lines,
    history: [],
    links: [],
    createdAt: created || new Date().toISOString(),
    updatedAt: updated || new Date().toISOString(),
  };
}

type Named = { id: string; code?: string; sku?: string; name?: string; legal_name?: string; trading_name?: string; document_number?: string; gate_entry_number?: string; grn_number?: string; inspection_number?: string; lot_number?: string; status?: string; is_active?: boolean; created_at?: string; updated_at?: string };

export async function listTypedSuppliers(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { country?: string; email?: string; phone?: string; payment_terms?: string }>(M2_TYPED_PATHS.vendors);
  return rows.map((r) =>
    baseRecord(
      "suppliers",
      r.id,
      r.code ?? r.id,
      r.trading_name || r.legal_name || r.code || "Supplier",
      r.is_active === false ? "inactive" : "active",
      {
        name: r.legal_name,
        displayName: r.trading_name,
        country: r.country,
        email: r.email,
        phone: r.phone,
        paymentTerms: r.payment_terms,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedProducts(): Promise<ErpRecord[]> {
  const [items, balanceRows] = await Promise.all([
    listRows<Named & { item_type?: string; qc_required?: boolean }>(M2_TYPED_PATHS.items),
    listRows<{ item?: string; item_sku?: string; sku?: string; on_hand?: string; available_to_consume?: string; available?: string; reserved?: string; qc_hold?: string }>(
      PHASE2_TYPED_API.balances,
    ).catch(() => []),
  ]);
  const balBySku = new Map(
    balanceRows.map((b) => [
      String(b.item_sku ?? b.sku ?? ""),
      {
        onHand: Number(b.on_hand ?? b.available ?? 0),
        available: Number(b.available_to_consume ?? b.available ?? 0),
        reserved: Number(b.reserved ?? 0),
        qcHold: Number(b.qc_hold ?? 0),
      },
    ]),
  );
  return items.map((r) => {
    const sku = r.sku ?? r.code ?? r.id;
    const bal = balBySku.get(sku) ?? { onHand: 0, available: 0, reserved: 0, qcHold: 0 };
    return baseRecord(
      "products",
      r.id,
      sku,
      r.name || sku,
      r.is_active === false ? "inactive" : "active",
      {
        name: r.name,
        type: r.item_type,
        qcRequired: r.qc_required,
        onHand: bal.onHand || bal.available,
        available: bal.available,
        reserved: bal.reserved,
        qcHold: bal.qcHold,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    );
  });
}

export async function listTypedWarehouses(): Promise<ErpRecord[]> {
  const rows = await listRows<Named>(M2_TYPED_PATHS.facilities);
  return rows.map((r) =>
    baseRecord(
      "warehouses",
      r.id,
      r.code ?? r.id,
      r.name || r.code || "Warehouse",
      r.is_active === false ? "inactive" : "active",
      { name: r.name, typedId: r.id },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedBins(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { warehouse?: string; bin_type?: string; warehouse_code?: string }>(
    M2_TYPED_PATHS.storageBins,
  );
  return rows.map((r) =>
    baseRecord(
      "bins",
      r.id,
      r.code ?? r.id,
      r.code || "Bin",
      "active",
      {
        name: r.code,
        warehouse: r.warehouse_code || r.warehouse,
        zone: r.bin_type,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedPurchaseOrders(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      supplier?: string;
      notes?: string;
      lines?: Array<{
        id: string;
        item?: string;
        ordered_quantity?: string;
        unit_price?: string;
        uom?: string;
      }>;
    }
  >(PHASE3_TYPED_API.purchaseOrders);
  return rows.map((r) => {
    const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
      id: l.id || `l-${i}`,
      item: String(l.item ?? ""),
      description: "",
      uom: String(l.uom ?? "KG"),
      qty: Number(l.ordered_quantity ?? 0),
      rate: Number(l.unit_price ?? 0),
    }));
    return baseRecord(
      "purchase_orders",
      r.id,
      r.document_number ?? r.id,
      r.notes || r.document_number || "Purchase Order",
      r.status ?? "draft",
      {
        supplier: r.supplier,
        typedId: r.id,
        typedPurchaseOrderId: r.id,
      },
      lines,
      r.created_at,
      r.updated_at,
    );
  });
}

export async function listTypedGateEntries(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { supplier?: string; purchase_order?: string; vehicle_number?: string; driver_name?: string }>(
    PHASE2_TYPED_API.inboundGates,
  );
  return rows.map((r) =>
    baseRecord(
      "gate_entries",
      r.id,
      r.gate_entry_number ?? r.document_number ?? r.id,
      r.gate_entry_number || "Gate Entry",
      r.status ?? "draft",
      {
        supplier: r.supplier,
        purchaseOrder: r.purchase_order,
        vehicle: r.vehicle_number,
        driver: r.driver_name,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedGrns(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      supplier?: string;
      warehouse?: string;
      gate_entry?: string;
      lines?: Array<{ item?: string; accepted_quantity?: string; lot_number?: string; purchase_unit_cost?: string }>;
    }
  >(PHASE2_TYPED_API.goodsReceipts);
  return rows.map((r) => {
    const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
      id: `gl-${i}`,
      item: String(l.item ?? ""),
      description: "",
      uom: "KG",
      qty: Number(l.accepted_quantity ?? 0),
      rate: Number(l.purchase_unit_cost ?? 0),
      batch: l.lot_number,
    }));
    const accepted = lines.reduce((s, l) => s + l.qty, 0);
    return baseRecord(
      "grns",
      r.id,
      r.grn_number ?? r.document_number ?? r.id,
      r.grn_number || "GRN",
      r.status ?? "draft",
      {
        supplier: r.supplier,
        warehouse: r.warehouse,
        gateEntry: r.gate_entry,
        acceptedQty: accepted,
        typedId: r.id,
      },
      lines,
      r.created_at,
      r.updated_at,
    );
  });
}

export async function listTypedBills(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      supplier?: string;
      purchase_order?: string;
      grn?: string;
      match_status?: string;
      total?: string;
      lines?: Array<{ id: string; item?: string; quantity?: string; unit_price?: string }>;
    }
  >(PHASE3_TYPED_API.supplierBills);
  return rows.map((r) => {
    const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
      id: l.id || `bl-${i}`,
      item: String(l.item ?? ""),
      description: "",
      uom: "KG",
      qty: Number(l.quantity ?? 0),
      rate: Number(l.unit_price ?? 0),
    }));
    return baseRecord(
      "purchase_bills",
      r.id,
      r.document_number ?? r.id,
      r.document_number || "Supplier Bill",
      r.status ?? "draft",
      {
        supplier: r.supplier,
        purchaseOrder: r.purchase_order,
        grn: r.grn,
        matchStatus: r.match_status,
        amount: Number(r.total ?? 0),
        typedId: r.id,
        typedBillId: r.id,
      },
      lines,
      r.created_at,
      r.updated_at,
    );
  });
}

export async function listTypedSalesOrders(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      customer?: string;
      notes?: string;
      lines?: Array<{ id: string; item?: string; ordered_quantity?: string; unit_price?: string; reserved_quantity?: string }>;
    }
  >(PHASE3_TYPED_API.salesOrders);
  return rows.map((r) => {
    const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
      id: l.id || `sl-${i}`,
      item: String(l.item ?? ""),
      description: "",
      uom: "KG",
      qty: Number(l.ordered_quantity ?? 0),
      rate: Number(l.unit_price ?? 0),
    }));
    return baseRecord(
      "sales_orders",
      r.id,
      r.document_number ?? r.id,
      r.notes || r.document_number || "Sales Order",
      r.status ?? "draft",
      {
        customer: r.customer,
        typedId: r.id,
        typedSalesOrderId: r.id,
      },
      lines,
      r.created_at,
      r.updated_at,
    );
  });
}

export async function listTypedDispatches(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { sales_order?: string; warehouse?: string; notes?: string }>(
    PHASE3_TYPED_API.dispatchNotes,
  );
  return rows.map((r) =>
    baseRecord(
      "deliveries",
      r.id,
      r.document_number ?? r.id,
      r.notes || r.document_number || "Dispatch",
      r.status ?? "draft",
      {
        salesOrder: r.sales_order,
        warehouse: r.warehouse,
        typedId: r.id,
        typedDispatchId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedInvoices(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { customer?: string; sales_order?: string; dispatch_note?: string; total?: string }>(
    PHASE3_TYPED_API.salesInvoices,
  );
  return rows.map((r) =>
    baseRecord(
      "invoices",
      r.id,
      r.document_number ?? r.id,
      r.document_number || "Sales Invoice",
      r.status ?? "draft",
      {
        customer: r.customer,
        salesOrder: r.sales_order,
        delivery: r.dispatch_note,
        amount: Number(r.total ?? 0),
        typedId: r.id,
        typedInvoiceId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedInspections(): Promise<ErpRecord[]> {
  const rows = await listRows<Named & { lot?: string; item?: string; grn?: string; remarks?: string; fail_disposition?: string }>(
    PHASE2_TYPED_API.lotInspections,
  );
  return rows.map((r) =>
    baseRecord(
      "qc_inspections",
      r.id,
      r.inspection_number ?? r.id,
      r.inspection_number || "QC Inspection",
      r.status ?? "draft",
      {
        lot: r.lot,
        product: r.item,
        grn: r.grn,
        remarks: r.remarks,
        disposition: r.fail_disposition,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedStockMovements(): Promise<ErpRecord[]> {
  const rows = await listRows<{
    id: string;
    txn_type?: string;
    quantity?: string;
    item_sku?: string;
    warehouse_code?: string;
    reference_type?: string;
    reference_id?: string;
    occurred_at?: string;
    created_at?: string;
  }>(PHASE2_TYPED_API.stockLedger);
  return rows.map((r, i) =>
    baseRecord(
      "stock_movements",
      r.id,
      `LED-${String(i + 1).padStart(4, "0")}`,
      r.txn_type || "Movement",
      "posted",
      {
        type: r.txn_type,
        product: r.item_sku,
        qty: Number(r.quantity ?? 0),
        warehouse: r.warehouse_code,
        reference: `${r.reference_type ?? ""} ${r.reference_id ?? ""}`.trim(),
        typedId: r.id,
      },
      [],
      r.occurred_at || r.created_at,
      r.created_at,
    ),
  );
}

export async function listM2TypedEntity(entity: string): Promise<ErpRecord[] | null> {
  switch (entity) {
    case "suppliers":
      return listTypedSuppliers();
    case "products":
      return listTypedProducts();
    case "warehouses":
      return listTypedWarehouses();
    case "bins":
      return listTypedBins();
    case "purchase_orders":
      return listTypedPurchaseOrders();
    case "gate_entries":
      return listTypedGateEntries();
    case "grns":
      return listTypedGrns();
    case "purchase_bills":
      return listTypedBills();
    case "sales_orders":
      return listTypedSalesOrders();
    case "deliveries":
      return listTypedDispatches();
    case "invoices":
      return listTypedInvoices();
    case "qc_inspections":
      return listTypedInspections();
    case "stock_movements":
      return listTypedStockMovements();
    default:
      return null;
  }
}
