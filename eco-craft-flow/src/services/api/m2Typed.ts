/**
 * Milestone 2 P0 — typed API → ErpRecord adapters for the demo journey.
 * DomainRecord routes remain for non-demo modules.
 */
import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta } from "./client";
import type { DocStatus, ErpRecord, LineItem } from "@/types/erp";
import { PHASE1_TYPED_API } from "./phase1";
import { PHASE2_TYPED_API } from "./phase2";
import { PHASE3_TYPED_API } from "./phase3";

import { typedUnavailable } from "./typedEntities";

export { M2_DEMO_TYPED_ENTITIES, M2_TYPED_DETAIL_ENTITIES } from "./typedEntities";

export const M2_TYPED_PATHS = {
  vendors: `${API_V1}/purchase/vendors/`,
  items: `${API_V1}/inventory/items/`,
  facilities: `${API_V1}/warehouse/facilities/`,
  storageBins: `${API_V1}/warehouse/storage-bins/`,
  lots: `${API_V1}/inventory/lots/`,
  landedDocs: `${API_V1}/inventory/landed-cost-documents/`,
} as const;

const UUID_RE = /^[0-9a-f-]{32,36}$/i;

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

type PurchaseOrderRow = Named & {
  supplier?: string;
  supplier_code?: string;
  supplier_name?: string;
  currency?: string | null;
  currency_code?: string;
  exchange_rate?: string;
  incoterm?: string | null;
  named_place?: string;
  destination_warehouse?: string | null;
  payment_terms?: string;
  expected_delivery_date?: string | null;
  notes?: string;
  revision_no?: number;
  approved_at?: string | null;
  closed_at?: string | null;
  lines?: Array<{
    id: string;
    item?: string;
    item_sku?: string;
    item_name?: string;
    ordered_quantity?: string;
    received_quantity?: string;
    cancelled_quantity?: string;
    remaining_receivable?: string;
    unit_price?: string;
    discount_pct?: string;
    tax_pct?: string;
    destination_warehouse?: string | null;
    uom?: string;
    uom_code?: string;
    notes?: string;
  }>;
};

type ProformaInvoiceRow = Named & {
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
};

type LetterOfCreditRow = Named & {
  purchase_order?: string;
  proforma_invoice?: string;
  supplier?: string;
  bank_name?: string;
  lc_number?: string;
  currency_code?: string;
  amount?: string;
  expiry_date?: string | null;
  latest_shipment_date?: string | null;
  seller_approval_note?: string;
  final_lc_number?: string;
  match_result?: Record<string, unknown>;
  pre_dispatch_message?: string;
  draft_scan_url?: string;
  draft_extracted?: Record<string, unknown>;
  document_checklist?: Record<string, unknown>;
  notes?: string;
  gate_allowed?: boolean;
  gate_message?: string;
};

type ImportShipmentRow = Named & {
  company?: string;
  shipment_number?: string;
  supplier?: string;
  incoterm?: string | null;
  named_place?: string;
  purchase_reference?: string;
  purchase_order?: string | null;
  etd?: string | null;
  eta?: string | null;
  notes?: string;
};

type GateEntryRow = Named & {
  supplier?: string;
  shipment?: string | null;
  purchase_reference?: string;
  purchase_order?: string;
  vehicle_number?: string;
  driver_name?: string;
  material_reference?: string;
  quantity_note?: string;
  document_references?: unknown;
  remarks?: string;
  lc_gate_allowed?: boolean;
  lc_gate_message?: string;
  lc_id?: string | null;
  lc_document_number?: string | null;
  lc_status?: string | null;
};

type GoodsReceiptRow = Named & {
  supplier?: string;
  warehouse?: string;
  receiving_bin?: string | null;
  gate_entry?: string;
  shipment?: string | null;
  purchase_reference?: string;
  received_at?: string;
  currency?: string | null;
  posted_at?: string | null;
  notes?: string;
  lc_gate_allowed?: boolean;
  lc_gate_message?: string;
  lc_id?: string | null;
  lc_document_number?: string | null;
  lc_status?: string | null;
  lines?: Array<{
    id?: string;
    item?: string;
    uom?: string;
    received_quantity?: string;
    accepted_quantity?: string;
    rejected_quantity?: string;
    purchase_unit_cost?: string;
    supplier_lot_number?: string;
    lot_number?: string;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    lot?: string | null;
    receipt_layer?: string | null;
    purchase_order_line?: string | null;
    line_notes?: string;
  }>;
};

export type TypedOption = { id: string; code: string; label: string };

export async function listTypedUoms(): Promise<TypedOption[]> {
  const rows = await listRows<Named & { symbol?: string }>(PHASE1_TYPED_API.uoms);
  return rows.map((r) => ({
    id: r.id,
    code: r.code ?? r.id,
    label: [r.code, r.name || r.symbol].filter(Boolean).join(" - "),
  }));
}

export async function listTypedCurrencies(): Promise<TypedOption[]> {
  const rows = await listRows<Named & { symbol?: string }>(PHASE1_TYPED_API.currencies);
  return rows.map((r) => ({
    id: r.id,
    code: r.code ?? r.id,
    label: [r.code, r.name || r.symbol].filter(Boolean).join(" - "),
  }));
}

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

function supplierBody(partial: Partial<ErpRecord>, fallbackCode?: string) {
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  return {
    code: String(partial.code || fallbackCode || "").trim() || undefined,
    legal_name: String(fields.name || partial.title || "").trim(),
    trading_name: String(fields.displayName || partial.title || fields.name || "").trim(),
    country: String(fields.country || ""),
    contact_name: String(fields.contactPerson || ""),
    email: String(fields.email || ""),
    phone: String(fields.phone || ""),
    tax_id: String(fields.pan || ""),
    payment_terms: String(fields.paymentTerms || ""),
    notes: String(fields.notes || ""),
    is_active: partial.status !== "inactive",
  };
}

export async function createTypedSupplier(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const body = { ...supplierBody(partial, partial.code), company };
  if (!body.legal_name) throw new Error("Supplier name is required.");
  const created = await apiFetch<Named & { country?: string; email?: string; phone?: string; payment_terms?: string }>(
    M2_TYPED_PATHS.vendors,
    { method: "POST", body },
  );
  return (await listTypedSuppliers()).find((row) => row.id === created.id) ?? baseRecord(
    "suppliers",
    created.id,
    created.code ?? String(body.code ?? created.id),
    created.trading_name || created.legal_name || String(body.legal_name),
    created.is_active === false ? "inactive" : "active",
    { ...body, typedId: created.id },
    [],
    created.created_at,
    created.updated_at,
  );
}

export async function updateTypedSupplier(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const body = supplierBody(partial);
  delete body.code;
  const updated = await apiFetch<Named>(`${M2_TYPED_PATHS.vendors}${id}/`, {
    method: "PATCH",
    body,
  });
  return (await listTypedSuppliers()).find((row) => row.id === updated.id) ?? baseRecord(
    "suppliers",
    updated.id,
    updated.code ?? id,
    updated.trading_name || updated.legal_name || "Supplier",
    updated.is_active === false ? "inactive" : "active",
    { ...body, typedId: updated.id },
    [],
    updated.created_at,
    updated.updated_at,
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

function warehouseBody(partial: Partial<ErpRecord>, fallbackCode?: string) {
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const name = String(fields.name || partial.title || "").trim();
  return {
    code: String(partial.code || fallbackCode || "").trim() || undefined,
    name,
    address: String(fields.location || fields.address || ""),
    is_active: partial.status !== "inactive",
  };
}

export async function createTypedWarehouse(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const body = { ...warehouseBody(partial, partial.code), company };
  if (!body.name) throw new Error("Warehouse name is required.");
  const created = await apiFetch<Named & { address?: string }>(M2_TYPED_PATHS.facilities, {
    method: "POST",
    body,
  });
  return baseRecord(
    "warehouses",
    created.id,
    created.code ?? String(body.code ?? created.id),
    created.name || body.name,
    created.is_active === false ? "inactive" : "active",
    { name: created.name || body.name, location: created.address || body.address, typedId: created.id },
    [],
    created.created_at,
    created.updated_at,
  );
}

export async function updateTypedWarehouse(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const body = warehouseBody(partial);
  delete body.code;
  const updated = await apiFetch<Named & { address?: string }>(`${M2_TYPED_PATHS.facilities}${id}/`, {
    method: "PATCH",
    body,
  });
  return baseRecord(
    "warehouses",
    updated.id,
    updated.code ?? id,
    updated.name || String(body.name || "Warehouse"),
    updated.is_active === false ? "inactive" : "active",
    { name: updated.name || body.name, location: updated.address || body.address, typedId: updated.id },
    [],
    updated.created_at,
    updated.updated_at,
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

async function resolveWarehouseId(ref: unknown): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("Warehouse is required.");
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const rows = await listTypedWarehouses();
  const hit = rows.find((r) => r.id === raw || r.code === raw || r.title === raw);
  if (!hit) throw new Error(`Warehouse "${raw}" not found.`);
  return hit.id;
}

async function resolveSupplierId(ref: unknown): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("Supplier is required.");
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const rows = await listTypedSuppliers();
  const hit = rows.find((r) => r.id === raw || r.code === raw || r.title === raw || String(r.fields?.typedId) === raw);
  if (!hit) throw new Error(`Supplier "${raw}" not found.`);
  return String(hit.fields?.typedId ?? hit.id);
}

async function resolveProductId(ref: unknown): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("Item is required.");
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const rows = await listTypedProducts();
  const hit = rows.find((r) => r.id === raw || r.code === raw || r.title === raw || String(r.fields?.typedId) === raw);
  if (!hit) throw new Error(`Item "${raw}" not found.`);
  return String(hit.fields?.typedId ?? hit.id);
}

async function resolvePurchaseUomId(ref: unknown): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("UOM is required.");
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const rows = await listTypedUoms();
  const hit = rows.find((r) => r.id === raw || r.code === raw || r.label === raw);
  if (!hit) throw new Error(`UOM "${raw}" not found.`);
  return hit.id;
}

async function resolveCurrencyId(ref: unknown): Promise<string | undefined> {
  const raw = String(ref ?? "").trim();
  if (!raw) return undefined;
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const rows = await listTypedCurrencies();
  const hit = rows.find((r) => r.id === raw || r.code === raw || r.label === raw);
  if (!hit) throw new Error(`Currency "${raw}" not found.`);
  return hit.id;
}

export async function createTypedBin(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const warehouse = await resolveWarehouseId(fields.warehouse);
  const code = String(fields.name || partial.code || "").trim();
  if (!code) throw new Error("Bin code is required.");
  const body = {
    warehouse,
    code,
    name: String(fields.title || ""),
    bin_type: String(fields.zone || "GENERAL").toUpperCase().replace(/\s+/g, "_"),
    is_active: partial.status !== "inactive",
  };
  const created = await apiFetch<Named & { warehouse?: string; bin_type?: string }>(M2_TYPED_PATHS.storageBins, {
    method: "POST",
    body,
  });
  return baseRecord(
    "bins",
    created.id,
    created.code ?? code,
    created.code || code,
    created.is_active === false ? "inactive" : "active",
    { name: created.code ?? code, warehouse: created.warehouse ?? warehouse, zone: created.bin_type ?? body.bin_type, typedId: created.id },
    [],
    created.created_at,
    created.updated_at,
  );
}

const PO_STATUS: Record<string, DocStatus> = {
  DRAFT: "draft",
  SUBMITTED: "pending_approval",
  APPROVED: "approved",
  SENT: "approved",
  PARTIALLY_RECEIVED: "in_progress",
  RECEIVED: "completed",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

function mapTypedPurchaseOrder(r: PurchaseOrderRow): ErpRecord {
  const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
    id: l.id || `l-${i}`,
    item: l.item_sku || String(l.item ?? ""),
    description: l.item_name ?? l.notes ?? "",
    uom: l.uom_code || String(l.uom ?? ""),
    warehouse: l.destination_warehouse ?? undefined,
    qty: Number(l.ordered_quantity ?? 0),
    rate: Number(l.unit_price ?? 0),
    discountPct: Number(l.discount_pct ?? 0),
    taxPct: Number(l.tax_pct ?? 0),
  }));
  const record = baseRecord(
    "purchase_orders",
    r.id,
    r.document_number ?? r.id,
    r.notes || r.document_number || "Purchase Order",
    r.status ?? "draft",
    {
      supplier: r.supplier,
      supplierName: r.supplier_name || r.supplier_code,
      currency: r.currency_code,
      currencyId: r.currency,
      exchangeRate: r.exchange_rate,
      incoterm: r.incoterm,
      namedPlace: r.named_place,
      destinationWarehouse: r.destination_warehouse,
      paymentTerms: r.payment_terms,
      deliveryDate: r.expected_delivery_date ?? undefined,
      expectedDeliveryDate: r.expected_delivery_date ?? undefined,
      revisionNo: r.revision_no,
      approvedAt: r.approved_at,
      closedAt: r.closed_at,
      notes: r.notes,
      serverStatus: r.status,
      typedId: r.id,
      typedPurchaseOrderId: r.id,
    },
    lines,
    r.created_at,
    r.updated_at,
  );
  return { ...record, status: PO_STATUS[String(r.status ?? "").toUpperCase()] ?? record.status };
}

export async function listTypedPurchaseOrders(): Promise<ErpRecord[]> {
  const rows = await listRows<PurchaseOrderRow>(PHASE3_TYPED_API.purchaseOrders);
  return rows.map(mapTypedPurchaseOrder);
}

async function resolveTypedDetailId(entity: string, ref: string): Promise<string> {
  const raw = String(ref ?? "").trim();
  if (!raw) throw new Error("Record id is required.");
  if (UUID_RE.test(raw)) return raw;
  const rows =
    entity === "purchase_orders"
      ? await listTypedPurchaseOrders()
      : entity === "proforma_invoices"
        ? await listTypedProformaInvoices()
        : entity === "letters_of_credit"
          ? await listTypedLettersOfCredit()
          : entity === "shipments"
            ? await listTypedShipments()
            : entity === "gate_entries"
              ? await listTypedGateEntries()
              : entity === "grns"
                ? await listTypedGrns()
                : [];
  const hit = rows.find((r) => r.id === raw || r.code === raw || String(r.fields?.typedId) === raw);
  if (!hit) throw new Error(`Record "${raw}" not found.`);
  return String(hit.fields?.typedId ?? hit.id);
}

export async function getTypedPurchaseOrder(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("purchase_orders", id);
  const row = await apiFetch<PurchaseOrderRow>(`${PHASE3_TYPED_API.purchaseOrders}${pk}/`, { silent: true });
  return mapTypedPurchaseOrder(row);
}

export async function createTypedPurchaseOrder(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const destinationWarehouseRef = fields.destinationWarehouse ?? fields.destination_warehouse;
  const destinationWarehouse = destinationWarehouseRef ? await resolveWarehouseId(destinationWarehouseRef) : undefined;
  const lines = partial.lines ?? [];
  if (!lines.length) throw new Error("Add at least one purchase order line.");

  const body: Record<string, unknown> = {
    company,
    supplier: await resolveSupplierId(fields.supplier),
    exchange_rate: String(fields.exchangeRate ?? fields.exchange_rate ?? 1),
    named_place: String(fields.namedPlace ?? fields.named_place ?? ""),
    payment_terms: String(fields.paymentTerms ?? fields.payment_terms ?? ""),
    notes: String(fields.notes ?? partial.title ?? ""),
    lines: await Promise.all(
      lines.map(async (line) => {
        const lineWarehouseRef = line.warehouse || destinationWarehouseRef;
        const item = await resolveProductId(line.item);
        const uom = await resolvePurchaseUomId(line.uom);
        const orderedQuantity = Number(line.qty);
        if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) throw new Error("Ordered quantity must be greater than zero.");
        const unitPrice = Number(line.rate);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Unit price cannot be negative.");
        const row: Record<string, unknown> = {
          item,
          uom,
          ordered_quantity: String(orderedQuantity),
          unit_price: String(unitPrice),
          discount_pct: String(Number(line.discountPct ?? 0) || 0),
          tax_pct: String(Number(line.taxPct ?? 0) || 0),
          notes: line.description ?? "",
        };
        if (lineWarehouseRef) row.destination_warehouse = await resolveWarehouseId(lineWarehouseRef);
        return row;
      }),
    ),
  };
  const currency = await resolveCurrencyId(fields.currency);
  if (currency) body.currency = currency;
  if (fields.incoterm) body.incoterm = fields.incoterm;
  if (destinationWarehouse) body.destination_warehouse = destinationWarehouse;
  if (fields.expectedDeliveryDate || fields.deliveryDate) body.expected_delivery_date = fields.expectedDeliveryDate ?? fields.deliveryDate;

  const created = await apiFetch<
    Named & {
      supplier?: string;
      supplier_code?: string;
      supplier_name?: string;
      currency_code?: string;
      payment_terms?: string;
      expected_delivery_date?: string | null;
      notes?: string;
      lines?: Array<{
        id: string;
        item?: string;
        item_sku?: string;
        item_name?: string;
        ordered_quantity?: string;
        unit_price?: string;
        discount_pct?: string;
        tax_pct?: string;
        uom?: string;
        uom_code?: string;
      }>;
    }
  >(PHASE3_TYPED_API.purchaseOrders, { method: "POST", body, silent: true });

  const createdLines: LineItem[] = (created.lines ?? []).map((line, i) => ({
    id: line.id || `l-${i}`,
    item: line.item_sku || String(line.item ?? ""),
    description: line.item_name ?? "",
    uom: line.uom_code || String(line.uom ?? ""),
    qty: Number(line.ordered_quantity ?? 0),
    rate: Number(line.unit_price ?? 0),
    discountPct: Number(line.discount_pct ?? 0),
    taxPct: Number(line.tax_pct ?? 0),
  }));
  const record = baseRecord(
    "purchase_orders",
    created.id,
    created.document_number ?? created.id,
    created.notes || created.document_number || "Purchase Order",
    created.status ?? "DRAFT",
    {
      supplier: created.supplier,
      supplierName: created.supplier_name || created.supplier_code,
      currency: created.currency_code,
      paymentTerms: created.payment_terms,
      deliveryDate: created.expected_delivery_date ?? undefined,
      serverStatus: created.status,
      typedId: created.id,
      typedPurchaseOrderId: created.id,
    },
    createdLines,
    created.created_at,
    created.updated_at,
  );
  return { ...record, status: PO_STATUS[String(created.status ?? "").toUpperCase()] ?? record.status };
}

function mapTypedProformaInvoice(r: ProformaInvoiceRow): ErpRecord {
  return baseRecord(
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
      serverStatus: r.status,
      typedId: r.id,
    },
    [],
    r.created_at,
    r.updated_at,
  );
}

export async function listTypedProformaInvoices(): Promise<ErpRecord[]> {
  const rows = await listRows<ProformaInvoiceRow>(PHASE3_TYPED_API.proformaInvoices);
  return rows.map(mapTypedProformaInvoice);
}

export async function getTypedProformaInvoice(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("proforma_invoices", id);
  const row = await apiFetch<ProformaInvoiceRow>(`${PHASE3_TYPED_API.proformaInvoices}${pk}/`, { silent: true });
  return mapTypedProformaInvoice(row);
}

function mapTypedLetterOfCredit(r: LetterOfCreditRow): ErpRecord {
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
      finalLcNumber: r.final_lc_number,
      currencyCode: r.currency_code,
      amount: Number(r.amount ?? 0),
      expiryDate: r.expiry_date,
      latestShipmentDate: r.latest_shipment_date,
      draftScanUrl: r.draft_scan_url,
      draftExtracted: r.draft_extracted,
      matchResult: r.match_result,
      matchSummary,
      sellerApprovalNote: r.seller_approval_note,
      documentChecklist: r.document_checklist,
      preDispatchMessage: r.pre_dispatch_message,
      gateAllowed: r.gate_allowed,
      gateMessage: r.gate_message,
      notes: r.notes,
      serverStatus: r.status,
      typedId: r.id,
    },
    [],
    r.created_at,
    r.updated_at,
  );
}

export async function listTypedLettersOfCredit(): Promise<ErpRecord[]> {
  const rows = await listRows<LetterOfCreditRow>(PHASE3_TYPED_API.lettersOfCredit);
  return rows.map(mapTypedLetterOfCredit);
}

export async function getTypedLetterOfCredit(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("letters_of_credit", id);
  const row = await apiFetch<LetterOfCreditRow>(`${PHASE3_TYPED_API.lettersOfCredit}${pk}/`, { silent: true });
  return mapTypedLetterOfCredit(row);
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

export async function listTypedIncoterms(): Promise<TypedOption[]> {
  const rows = await listRows<Named & { code?: string; name?: string }>(PHASE1_TYPED_API.incoterms);
  return rows.map((r) => ({
    id: r.id,
    code: r.code || r.name || r.id,
    label: [r.code, r.name].filter(Boolean).join(" - ") || r.id,
  }));
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

function mapTypedShipment(r: ImportShipmentRow): ErpRecord {
  const record = baseRecord(
    "shipments",
    r.id,
    r.shipment_number ?? r.document_number ?? r.id,
    r.shipment_number || r.purchase_reference || "Shipment",
    r.is_active === false ? "inactive" : "active",
    {
      company: r.company,
      supplier: r.supplier,
      incoterm: r.incoterm,
      namedPlace: r.named_place,
      purchaseReference: r.purchase_reference,
      purchaseOrder: r.purchase_order,
      etd: r.etd,
      eta: r.eta,
      notes: r.notes,
      isActive: r.is_active !== false,
      typedId: r.id,
    },
    [],
    r.created_at,
    r.updated_at,
  );
  return {
    ...record,
    links: [
      ...(r.purchase_order ? [{ entity: "purchase_orders", id: r.purchase_order }] : []),
      ...(r.supplier ? [{ entity: "suppliers", id: r.supplier }] : []),
    ],
  };
}

export async function listTypedShipments(): Promise<ErpRecord[]> {
  const rows = await listRows<ImportShipmentRow>(PHASE2_TYPED_API.importShipments);
  return rows.map(mapTypedShipment);
}

export async function getTypedShipment(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("shipments", id);
  const row = await apiFetch<ImportShipmentRow>(`${PHASE2_TYPED_API.importShipments}${pk}/`, { silent: true });
  return mapTypedShipment(row);
}

function shipmentPayload(fields: Record<string, unknown>, company?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    shipment_number: String(fields.shipmentNumber ?? fields.shipment_number ?? "").trim(),
    supplier: String(fields.supplier ?? "").trim(),
    named_place: String(fields.namedPlace ?? fields.named_place ?? ""),
    purchase_reference: String(fields.purchaseReference ?? fields.purchase_reference ?? ""),
    notes: String(fields.notes ?? ""),
    is_active: fields.isActive ?? fields.is_active ?? true,
  };
  if (company) body.company = company;
  if (fields.incoterm) body.incoterm = fields.incoterm;
  if (fields.purchaseOrder) body.purchase_order = fields.purchaseOrder;
  if (fields.etd) body.etd = fields.etd;
  if (fields.eta) body.eta = fields.eta;
  return body;
}

export async function createTypedShipment(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const { resolveDefaultCompanyId } = await import("./crm");
  const company = await resolveDefaultCompanyId();
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const body = shipmentPayload(fields, company);
  if (!body.shipment_number) body.shipment_number = partial.code;
  const created = await apiFetch<ImportShipmentRow>(PHASE2_TYPED_API.importShipments, {
    method: "POST",
    body,
    silent: true,
  });
  return mapTypedShipment(created);
}

export async function updateTypedShipment(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("shipments", id);
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const updated = await apiFetch<ImportShipmentRow>(`${PHASE2_TYPED_API.importShipments}${pk}/`, {
    method: "PATCH",
    body: shipmentPayload(fields),
    silent: true,
  });
  return mapTypedShipment(updated);
}

function mapTypedGateEntry(r: GateEntryRow): ErpRecord {
  return baseRecord(
    "gate_entries",
    r.id,
    r.gate_entry_number ?? r.document_number ?? r.id,
    r.gate_entry_number || "Gate Entry",
    r.status ?? "draft",
    {
      supplier: r.supplier,
      shipment: r.shipment,
      purchaseReference: r.purchase_reference,
      purchaseOrder: r.purchase_order,
      vehicle: r.vehicle_number,
      driver: r.driver_name,
      materialReference: r.material_reference,
      quantityNote: r.quantity_note,
      documentReferences: r.document_references,
      remarks: r.remarks,
      serverStatus: r.status,
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
  );
}

export async function listTypedGateEntries(): Promise<ErpRecord[]> {
  const rows = await listRows<GateEntryRow>(PHASE2_TYPED_API.inboundGates);
  return rows.map(mapTypedGateEntry);
}

export async function getTypedGateEntry(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("gate_entries", id);
  const row = await apiFetch<GateEntryRow>(`${PHASE2_TYPED_API.inboundGates}${pk}/`, { silent: true });
  return mapTypedGateEntry(row);
}

function mapTypedGrn(r: GoodsReceiptRow): ErpRecord {
  const lines: LineItem[] = (r.lines ?? []).map((l, i) => ({
    id: l.id || `gl-${i}`,
    item: String(l.item ?? ""),
    description: [
      l.line_notes,
      l.supplier_lot_number ? `Supplier lot ${l.supplier_lot_number}` : "",
      l.received_quantity ? `Received ${l.received_quantity}` : "",
      l.rejected_quantity ? `Rejected ${l.rejected_quantity}` : "",
      l.purchase_order_line ? `PO line ${l.purchase_order_line}` : "",
      l.manufacturing_date ? `Mfg ${l.manufacturing_date}` : "",
      l.expiry_date ? `Exp ${l.expiry_date}` : "",
    ].filter(Boolean).join(" · "),
    uom: String(l.uom ?? ""),
    qty: Number(l.accepted_quantity ?? l.received_quantity ?? 0),
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
      receivingBin: r.receiving_bin,
      gateEntry: r.gate_entry,
      shipment: r.shipment,
      purchaseReference: r.purchase_reference,
      receivedAt: r.received_at,
      currency: r.currency,
      postedAt: r.posted_at,
      notes: r.notes,
      acceptedQty: accepted,
      receiptLines: r.lines ?? [],
      serverStatus: r.status,
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
}

export async function listTypedGrns(): Promise<ErpRecord[]> {
  const rows = await listRows<GoodsReceiptRow>(PHASE2_TYPED_API.goodsReceipts);
  return rows.map(mapTypedGrn);
}

export async function getTypedGrn(id: string): Promise<ErpRecord> {
  const pk = await resolveTypedDetailId("grns", id);
  const row = await apiFetch<GoodsReceiptRow>(`${PHASE2_TYPED_API.goodsReceipts}${pk}/`, { silent: true });
  return mapTypedGrn(row);
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
    case "shipments":
      return listTypedShipments();
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

export async function getM2TypedEntity(entity: string, id: string): Promise<ErpRecord | null> {
  switch (entity) {
    case "purchase_orders":
      return getTypedPurchaseOrder(id);
    case "proforma_invoices":
      return getTypedProformaInvoice(id);
    case "letters_of_credit":
      return getTypedLetterOfCredit(id);
    case "shipments":
      return getTypedShipment(id);
    case "gate_entries":
      return getTypedGateEntry(id);
    case "grns":
      return getTypedGrn(id);
    default:
      return null;
  }
}

/**
 * Server workflow endpoints reachable from the generic record actions.
 * Anything not listed is rejected — never simulated in the browser.
 */
const TYPED_WORKFLOW_ACTIONS: Record<string, Partial<Record<DocStatus, (id: string) => string>>> = {
  purchase_orders: {
    submitted: PHASE3_TYPED_API.purchaseOrderSubmit,
    pending_approval: PHASE3_TYPED_API.purchaseOrderSubmit,
    approved: PHASE3_TYPED_API.purchaseOrderApprove,
    cancelled: PHASE3_TYPED_API.purchaseOrderCancel,
    closed: PHASE3_TYPED_API.purchaseOrderClose,
  },
  gate_entries: {
    submitted: PHASE2_TYPED_API.gateSubmit,
    cancelled: PHASE2_TYPED_API.gateCancel,
  },
  grns: { posted: PHASE2_TYPED_API.grnPost },
  purchase_bills: {
    approved: PHASE3_TYPED_API.supplierBillApproveForAp,
    posted: PHASE3_TYPED_API.supplierBillPost,
  },
  sales_orders: {
    approved: PHASE3_TYPED_API.salesOrderConfirm,
    cancelled: PHASE3_TYPED_API.salesOrderCancel,
  },
  deliveries: { posted: PHASE3_TYPED_API.dispatchNotePost },
  invoices: {
    posted: PHASE3_TYPED_API.salesInvoicePost,
    cancelled: PHASE3_TYPED_API.salesInvoiceCancel,
  },
};

export function hasTypedWorkflowAction(entity: string, status: DocStatus): boolean {
  return Boolean(TYPED_WORKFLOW_ACTIONS[entity]?.[status]);
}

export async function runTypedWorkflowAction(
  entity: string,
  id: string,
  status: DocStatus,
  reason?: string,
): Promise<void> {
  const url = TYPED_WORKFLOW_ACTIONS[entity]?.[status];
  if (!url) throw typedUnavailable(entity, `Moving to "${status.replace(/_/g, " ")}"`);
  await apiFetch(url(id), {
    method: "POST",
    body: reason ? { reason, comment: reason } : {},
    silent: true,
  });
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

export async function updateTypedProduct(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const fields = (partial.fields ?? {}) as Record<string, unknown>;
  const productType = String(fields.type ?? "Raw Material");
  const map = PRODUCT_TYPE_TO_ITEM[productType] ?? PRODUCT_TYPE_TO_ITEM["Raw Material"];
  const name = String(fields.name ?? partial.title ?? "").trim();
  if (!name) throw new Error("Product name is required.");
  const body: Record<string, unknown> = {
    name,
    item_type: map.itemType,
    category: String(fields.category ?? ""),
    qc_required: map.qc,
    is_active: partial.status !== "inactive",
  };
  if (fields.reorderLevel !== "" && fields.reorderLevel != null) body.reorder_level = String(fields.reorderLevel);
  if (fields.safetyStock !== "" && fields.safetyStock != null) body.safety_stock = String(fields.safetyStock);
  if (fields.moq !== "" && fields.moq != null) body.minimum_order_quantity = String(fields.moq);
  if (fields.maxStock !== "" && fields.maxStock != null) body.maximum_stock = String(fields.maxStock);
  if (fields.rate !== "" && fields.rate != null) body.standard_cost = String(fields.rate);
  const updated = await apiFetch<Named & { item_type?: string; qc_required?: boolean; name?: string; sku?: string }>(
    `${M2_TYPED_PATHS.items}${id}/`,
    { method: "PATCH", body },
  );
  return baseRecord(
    "products",
    updated.id,
    updated.sku ?? updated.code ?? id,
    updated.name || name,
    updated.is_active === false ? "inactive" : "active",
    {
      ...fields,
      name: updated.name || name,
      type: productType,
      typedId: updated.id,
    },
    [],
    updated.created_at,
    updated.updated_at,
  );
}
