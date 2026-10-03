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
  "proforma_invoices",
  "letters_of_credit",
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

export async function listTypedProformaInvoices(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      purchase_order?: string;
      supplier?: string;
      seller_pi_number?: string;
      currency_code?: string;
      total_amount?: string;
      payment_terms?: string;
      lead_time_days?: number;
      expected_delivery_date?: string;
      notes?: string;
      attachment_url?: string;
    }
  >(PHASE3_TYPED_API.proformaInvoices);
  return rows.map((r) =>
    baseRecord(
      "proforma_invoices",
      r.id,
      r.document_number ?? r.id,
      r.seller_pi_number || r.document_number || "Proforma Invoice",
      r.status ?? "DRAFT",
      {
        purchaseOrder: r.purchase_order,
        supplier: r.supplier,
        sellerPiNumber: r.seller_pi_number,
        currencyCode: r.currency_code,
        totalAmount: Number(r.total_amount ?? 0),
        paymentTerms: r.payment_terms,
        leadTimeDays: r.lead_time_days,
        expectedDeliveryDate: r.expected_delivery_date,
        notes: r.notes,
        attachmentUrl: r.attachment_url,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    ),
  );
}

export async function listTypedLettersOfCredit(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      purchase_order?: string;
      proforma_invoice?: string;
      supplier?: string;
      bank_name?: string;
      lc_number?: string;
      currency_code?: string;
      amount?: string;
      match_result?: Record<string, unknown>;
      pre_dispatch_message?: string;
      draft_scan_url?: string;
      notes?: string;
      gate_allowed?: boolean;
      gate_message?: string;
    }
  >(PHASE3_TYPED_API.lettersOfCredit);
  return rows.map((r) => {
    const match = r.match_result ?? {};
    const issues = Array.isArray(match.issues) ? match.issues : [];
    const matchSummary =
      match.passed === true
        ? "Match passed (PO + PI)."
        : match.passed === false
          ? `Match failed: ${issues.map((i: { message?: string }) => i.message).filter(Boolean).join(" ")}`
          : "";
    return baseRecord(
      "letters_of_credit",
      r.id,
      r.document_number ?? r.id,
      r.bank_name || r.document_number || "Letter of Credit",
      r.status ?? "DRAFT",
      {
        purchaseOrder: r.purchase_order,
        proformaInvoice: r.proforma_invoice,
        supplier: r.supplier,
        bankName: r.bank_name,
        lcNumber: r.lc_number,
        currencyCode: r.currency_code,
        amount: Number(r.amount ?? 0),
        draftScanUrl: r.draft_scan_url,
        matchSummary,
        preDispatchMessage: r.pre_dispatch_message,
        gateAllowed: r.gate_allowed,
        gateMessage: r.gate_message,
        notes: r.notes,
        typedId: r.id,
      },
      [],
      r.created_at,
      r.updated_at,
    );
  });
}

async function resolvePoId(ref: unknown): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("Purchase Order is required.");
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  const rows = await listTypedPurchaseOrders();
  const hit = rows.find((r) => r.code === raw || r.id === raw || String(r.fields?.typedId) === raw);
  if (!hit) throw new Error(`Purchase Order "${raw}" not found.`);
  return String(hit.fields?.typedId ?? hit.id);
}

async function resolvePiId(ref: unknown): Promise<string | undefined> {
  const raw = String(ref ?? "").trim();
  if (!raw) return undefined;
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  const rows = await listTypedProformaInvoices();
  const hit = rows.find((r) => r.code === raw || r.id === raw || String(r.fields?.typedId) === raw);
  if (!hit) throw new Error(`Proforma Invoice "${raw}" not found.`);
  return String(hit.fields?.typedId ?? hit.id);
}

export async function createTypedProformaInvoice(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const poId = await resolvePoId(fields.purchaseOrder ?? fields.typedPurchaseOrderId);
  const body: Record<string, unknown> = {
    company,
    purchase_order: poId,
    seller_pi_number: String(fields.sellerPiNumber ?? ""),
    currency_code: String(fields.currencyCode ?? "USD"),
    total_amount: String(fields.totalAmount ?? 0),
    payment_terms: String(fields.paymentTerms ?? ""),
    notes: String(fields.notes ?? partial.title ?? ""),
    attachment_url: String(fields.attachmentUrl ?? ""),
  };
  if (fields.supplier) body.supplier = fields.supplier;
  if (fields.leadTimeDays != null && fields.leadTimeDays !== "") body.lead_time_days = Number(fields.leadTimeDays);
  if (fields.expectedDeliveryDate) body.expected_delivery_date = fields.expectedDeliveryDate;

  const created = await apiFetch<Named & { seller_pi_number?: string; total_amount?: string; purchase_order?: string }>(
    PHASE3_TYPED_API.proformaInvoices,
    { method: "POST", body },
  );
  return baseRecord(
    "proforma_invoices",
    created.id,
    created.document_number ?? created.id,
    created.seller_pi_number || created.document_number || "Proforma Invoice",
    created.status ?? "RECEIVED",
    {
      purchaseOrder: created.purchase_order ?? poId,
      sellerPiNumber: created.seller_pi_number,
      totalAmount: Number(created.total_amount ?? fields.totalAmount ?? 0),
      currencyCode: fields.currencyCode,
      leadTimeDays: fields.leadTimeDays,
      typedId: created.id,
    },
    [],
    created.created_at,
    created.updated_at,
  );
}

export async function createTypedLetterOfCredit(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const poId = await resolvePoId(fields.purchaseOrder ?? fields.typedPurchaseOrderId);
  const piId = await resolvePiId(fields.proformaInvoice);
  const body: Record<string, unknown> = {
    company,
    purchase_order: poId,
    bank_name: String(fields.bankName ?? ""),
    lc_number: String(fields.lcNumber ?? ""),
    currency_code: String(fields.currencyCode ?? "USD"),
    amount: String(fields.amount ?? 0),
    notes: String(fields.notes ?? partial.title ?? ""),
  };
  if (piId) body.proforma_invoice = piId;
  if (fields.supplier) body.supplier = fields.supplier;
  if (fields.expiryDate) body.expiry_date = fields.expiryDate;
  if (fields.latestShipmentDate) body.latest_shipment_date = fields.latestShipmentDate;

  const created = await apiFetch<Named & { bank_name?: string; amount?: string; purchase_order?: string }>(
    PHASE3_TYPED_API.lettersOfCredit,
    { method: "POST", body },
  );
  return baseRecord(
    "letters_of_credit",
    created.id,
    created.document_number ?? created.id,
    created.bank_name || created.document_number || "Letter of Credit",
    created.status ?? "DRAFT",
    {
      purchaseOrder: created.purchase_order ?? poId,
      proformaInvoice: piId,
      bankName: created.bank_name ?? fields.bankName,
      amount: Number(created.amount ?? fields.amount ?? 0),
      currencyCode: fields.currencyCode,
      typedId: created.id,
    },
    [],
    created.created_at,
    created.updated_at,
  );
}

export async function listTypedGateEntries(): Promise<ErpRecord[]> {
  const rows = await listRows<
    Named & {
      supplier?: string;
      purchase_order?: string;
      vehicle_number?: string;
      driver_name?: string;
      lc_gate_allowed?: boolean;
      lc_gate_message?: string;
      lc_id?: string | null;
      lc_document_number?: string | null;
      lc_status?: string | null;
    }
  >(PHASE2_TYPED_API.inboundGates);
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
        lcGateAllowed: r.lc_gate_allowed,
        lcGateMessage: r.lc_gate_message,
        lcId: r.lc_id,
        lcDocumentNumber: r.lc_document_number,
        lcStatus: r.lc_status,
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
      lc_gate_allowed?: boolean;
      lc_gate_message?: string;
      lc_id?: string | null;
      lc_document_number?: string | null;
      lc_status?: string | null;
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
        lcGateAllowed: r.lc_gate_allowed,
        lcGateMessage: r.lc_gate_message,
        lcId: r.lc_id,
        lcDocumentNumber: r.lc_document_number,
        lcStatus: r.lc_status,
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
  const rows = await listRows<
    Named & {
      lot?: string;
      item?: string;
      grn?: string;
      remarks?: string;
      fail_disposition?: string;
      coa_reference?: string;
      coa_attachment_url?: string;
      metrics?: Record<string, unknown>;
      ncr_reference?: string;
    }
  >(PHASE2_TYPED_API.lotInspections);
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
        coaReference: r.coa_reference,
        coaAttachmentUrl: r.coa_attachment_url,
        metrics: r.metrics,
        ncrReference: r.ncr_reference,
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
    case "proforma_invoices":
      return listTypedProformaInvoices();
    case "letters_of_credit":
      return listTypedLettersOfCredit();
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

const PRODUCT_TYPE_TO_ITEM: Record<string, { itemType: string; prefix: string; qc: boolean }> = {
  "Raw Material": { itemType: "RAW_MATERIAL", prefix: "RM", qc: true },
  "Semi-Finished": { itemType: "SEMI_FINISHED", prefix: "SFG", qc: true },
  "Finished Good": { itemType: "FINISHED_GOOD", prefix: "FG", qc: true },
  Consumable: { itemType: "CONSUMABLE", prefix: "CON", qc: false },
  Packaging: { itemType: "PACKAGING", prefix: "PKG", qc: false },
};

export function productSkuPrefix(productType: string): string {
  return PRODUCT_TYPE_TO_ITEM[productType]?.prefix ?? "ITM";
}

/** Suggest next SKU like RM-001 from existing typed items (+ optional local codes). */
export async function suggestProductSku(productType: string, extraCodes: string[] = []): Promise<string> {
  const prefix = productSkuPrefix(productType);
  let codes: string[] = [...extraCodes];
  try {
    const rows = await listRows<Named>(M2_TYPED_PATHS.items);
    codes = codes.concat(rows.map((r) => String(r.sku ?? r.code ?? "")));
  } catch {
    /* offline / API down — still suggest from extras */
  }
  const nums = codes
    .filter((c) => c.toUpperCase().startsWith(`${prefix}-`))
    .map((c) => Number(c.replace(/\D+/g, "").slice(-4)))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

async function resolveUomId(code: string): Promise<string> {
  const rows = await listRows<{ id: string; code: string }>(`${API_V1}/inventory/uoms/`);
  const hit = rows.find((u) => u.code.toUpperCase() === code.toUpperCase());
  if (!hit) throw new Error(`Unit of measure "${code}" not found. Seed UOMs (KG, PCS, …) first.`);
  return hit.id;
}

/** Create typed inventory Item from product form ErpRecord fields. */
export async function createTypedProduct(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const productType = String(fields.type ?? "Raw Material");
  const map = PRODUCT_TYPE_TO_ITEM[productType] ?? PRODUCT_TYPE_TO_ITEM["Raw Material"];
  const name = String(fields.name ?? partial.title ?? "").trim();
  if (!name) throw new Error("Product name is required.");

  const codeMode = String(fields.codeMode ?? "auto");
  let sku = String(partial.code ?? fields.sku ?? "").trim().toUpperCase();
  if (codeMode === "auto" || !sku) {
    sku = await suggestProductSku(productType);
  }
  if (!/^[A-Z0-9][A-Z0-9._-]{1,58}$/i.test(sku)) {
    throw new Error("Product code must be 2–59 characters (letters, numbers, .-_).");
  }

  const uomCode = String(fields.uom || "KG");
  const uomId = await resolveUomId(uomCode);
  const valuation = String(fields.valuation || "FIFO");
  const valuationMethod =
    valuation === "Weighted Average" ? "WEIGHTED_AVERAGE" : valuation === "Standard Cost" ? "STANDARD" : "FIFO";

  const body: Record<string, unknown> = {
    company,
    sku,
    name,
    item_type: map.itemType,
    category: String(fields.category ?? ""),
    base_uom: uomId,
    purchase_uom: uomId,
    stock_uom: uomId,
    qc_required: map.qc,
    fifo_eligible: valuationMethod === "FIFO",
    valuation_method: valuationMethod,
    is_active: true,
  };
  const maybeNum = (key: string, value: unknown) => {
    if (value === "" || value == null) return;
    body[key] = String(value);
  };
  maybeNum("reorder_level", fields.reorderLevel);
  maybeNum("safety_stock", fields.safetyStock);
  maybeNum("minimum_order_quantity", fields.moq);
  maybeNum("maximum_stock", fields.maxStock);
  maybeNum("standard_cost", fields.rate);

  const created = await apiFetch<Named & { item_type?: string; qc_required?: boolean; name?: string; sku?: string }>(
    M2_TYPED_PATHS.items,
    { method: "POST", body },
  );

  return baseRecord(
    "products",
    created.id,
    created.sku ?? sku,
    created.name || name,
    "active",
    {
      name: created.name || name,
      type: productType,
      uom: uomCode,
      rate: fields.rate,
      valuation,
      reorderLevel: fields.reorderLevel,
      onHand: 0,
      available: 0,
      reserved: 0,
      typedId: created.id,
      codeMode,
    },
    [],
    created.created_at,
    created.updated_at,
  );
}

