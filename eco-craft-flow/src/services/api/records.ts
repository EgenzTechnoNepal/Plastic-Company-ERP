import { apiFetch, apiFetchMeta, ApiError } from "./client";
import { isTypedEntity, typedUnavailable } from "./typedEntities";
import type { DocStatus, ErpRecord, LineItem, StatusEvent } from "@/types/erp";

/** Django path (under /api/v1) for each frontend entity key. */
export const RECORD_PATHS: Record<string, string> = {
  customers: "/crm/customers/",
  contacts: "/crm/contacts/",
  leads: "/crm/leads/",
  opportunities: "/crm/opportunities/",
  activities: "/crm/activities/",
  dealers: "/crm/dealers/",
  territories: "/crm/territories/",
  tickets: "/crm/tickets/",
  quotations: "/crm/quotations/",
  sales_orders: "/sales/orders/",
  deliveries: "/sales/deliveries/",
  invoices: "/sales/invoices/",
  payments: "/sales/payments/",
  sales_returns: "/sales/returns/",
  credit_notes: "/sales/credit-notes/",
  suppliers: "/purchase/suppliers/",
  purchase_requisitions: "/purchase/requisitions/",
  rfqs: "/purchase/rfqs/",
  purchase_orders: "/purchase/orders/",
  proforma_invoices: "/purchase/proforma-invoices/",
  letters_of_credit: "/purchase/letters-of-credit/",
  shipments: "/purchase/import-shipments/",
  gate_entries: "/purchase/gate-entries/",
  grns: "/purchase/receipts/",
  purchase_bills: "/purchase/bills/",
  purchase_returns: "/purchase/returns/",
  debit_notes: "/purchase/debit-notes/",
  vendor_payments: "/purchase/payments/",
  ocr_bills: "/purchase/ocr-bills/",
  products: "/inventory/products/",
  batches: "/inventory/batches/",
  stock_movements: "/inventory/movements/",
  stock_adjustments: "/inventory/adjustments/",
  warehouses: "/warehouse/warehouses/",
  bins: "/warehouse/bins/",
  stock_transfers: "/warehouse/transfers/",
  bin_transfers: "/warehouse/bin-transfers/",
  stock_counts: "/warehouse/counts/",
  quarantine: "/quality/quarantine/",
  boms: "/production/boms/",
  production_plans: "/production/plans/",
  mrp_runs: "/production/mrp/",
  work_orders: "/production/orders/",
  material_issues: "/production/issues/",
  operations: "/production/operations/",
  machines: "/production/machines/",
  machine_schedules: "/production/schedules/",
  quality_plans: "/quality/plans/",
  qc_inspections: "/quality/inspections/",
  ncrs: "/quality/ncrs/",
  capas: "/quality/capas/",
  instruments: "/quality/instruments/",
  certificates: "/quality/certificates/",
  employees: "/hr/employees/",
  attendance: "/hr/attendance/",
  leave_requests: "/hr/leaves/",
  payroll_runs: "/hr/payroll-runs/",
  payslips: "/hr/payslips/",
  performance_reviews: "/hr/performance/",
  recruitment: "/hr/recruitment/",
  accounts: "/accounting/accounts/",
  vouchers: "/accounting/vouchers/",
  expenses: "/accounting/expenses/",
  cost_centres: "/accounting/cost-centres/",
  assets: "/accounting/assets/",
  workflow_rules: "/workflow/rules/",
  whatsapp_templates: "/integrations/whatsapp-templates/",
  rfid_tags: "/integrations/rfid-tags/",
  iot_sensors: "/integrations/iot-sensors/",
  backups: "/integrations/backups/",
  ird_submissions: "/compliance/ird-submissions/",
  vat_registers: "/compliance/vat-registers/",
  insights: "/analytics/insights/",
  saved_reports: "/reports/saved/",
  outbound_mail: "/integrations/outbound-mail/",
};

export interface RecordDto {
  id: string;
  entity: string;
  code: string;
  title: string;
  date: string;
  status: string;
  fields: Record<string, unknown>;
  lines: LineItem[];
  history: StatusEvent[];
  links: Array<{ entity: string; id: string; label?: string }>;
  created_at: string;
  updated_at: string;
}

export function toErpRecord(row: RecordDto): ErpRecord {
  return {
    id: row.id,
    entity: row.entity,
    code: row.code,
    title: row.title,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
    status: row.status as DocStatus,
    fields: row.fields ?? {},
    lines: row.lines ?? [],
    history: row.history ?? [],
    links: row.links ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromErpRecord(record: Partial<ErpRecord>, entity: string) {
  return {
    entity,
    code: record.code,
    title: record.title,
    date: record.date,
    status: record.status,
    fields: record.fields ?? {},
    lines: record.lines ?? [],
    history: record.history ?? [],
    links: record.links ?? [],
  };
}

function pathFor(entity: string): string {
  const p = RECORD_PATHS[entity];
  if (!p) throw new Error(`No live API path for entity "${entity}"`);
  return p;
}

export async function listRecords(entity: string): Promise<ErpRecord[]> {
  if (entity === "customers") {
    const { listTypedCustomers } = await import("./crm");
    return listTypedCustomers();
  }
  if (entity === "contacts") {
    const { listTypedContacts } = await import("./crm");
    return listTypedContacts();
  }
  if (entity === "activities") {
    const { listTypedActivities } = await import("./crm");
    return listTypedActivities();
  }
  const { listM2TypedEntity } = await import("./m2Typed");
  const m2 = await listM2TypedEntity(entity);
  if (m2) return m2;
  const { data } = await apiFetchMeta<RecordDto[]>(pathFor(entity), {
    query: { page_size: 200 },
    silent: true,
  });
  return (Array.isArray(data) ? data : []).map(toErpRecord);
}

export async function getRecord(entity: string, id: string): Promise<ErpRecord> {
  const { getM2TypedEntity } = await import("./m2Typed");
  const m2 = await getM2TypedEntity(entity, id);
  if (m2) return m2;
  if (isTypedEntity(entity)) {
    const rows = await listRecords(entity);
    const found = rows.find((r) => r.id === id || r.code === id);
    if (!found) throw new ApiError("NOT_FOUND", "Not found", 404);
    return found;
  }
  const row = await apiFetch<RecordDto>(`${pathFor(entity)}${id}/`, { silent: true });
  return toErpRecord(row);
}

export async function createRecord(entity: string, record: Partial<ErpRecord>): Promise<ErpRecord> {
  if (entity === "customers") {
    const { createTypedCustomer } = await import("./crm");
    return createTypedCustomer(record);
  }
  if (entity === "contacts") {
    const { createTypedContact } = await import("./crm");
    return createTypedContact(record);
  }
  if (entity === "activities") {
    const { createTypedActivity } = await import("./crm");
    return createTypedActivity(record);
  }
  if (entity === "products") {
    const { createTypedProduct } = await import("./m2Typed");
    return createTypedProduct(record);
  }
  if (entity === "suppliers") {
    const { createTypedSupplier } = await import("./m2Typed");
    return createTypedSupplier(record);
  }
  if (entity === "warehouses") {
    const { createTypedWarehouse } = await import("./m2Typed");
    return createTypedWarehouse(record);
  }
  if (entity === "bins") {
    const { createTypedBin } = await import("./m2Typed");
    return createTypedBin(record);
  }
  if (entity === "purchase_orders") {
    const { createTypedPurchaseOrder } = await import("./m2Typed");
    return createTypedPurchaseOrder(record);
  }
  if (entity === "proforma_invoices") {
    const { createTypedProformaInvoice } = await import("./m2Typed");
    return createTypedProformaInvoice(record);
  }
  if (entity === "letters_of_credit") {
    const { createTypedLetterOfCredit } = await import("./m2Typed");
    return createTypedLetterOfCredit(record);
  }
  if (entity === "shipments") {
    const { createTypedShipment } = await import("./m2Typed");
    return createTypedShipment(record);
  }
  if (isTypedEntity(entity)) throw typedUnavailable(entity, "Creating records");
  const row = await apiFetch<RecordDto>(pathFor(entity), {
    method: "POST",
    body: fromErpRecord(record, entity),
    silent: true,
  });
  return toErpRecord(row);
}

export async function updateRecord(
  entity: string,
  id: string,
  record: Partial<ErpRecord>,
): Promise<ErpRecord> {
  if (entity === "customers") {
    const { updateTypedCustomer } = await import("./crm");
    return updateTypedCustomer(id, record);
  }
  if (entity === "contacts") {
    const { updateTypedContact } = await import("./crm");
    return updateTypedContact(id, record);
  }
  if (entity === "products") {
    const { updateTypedProduct } = await import("./m2Typed");
    return updateTypedProduct(id, record);
  }
  if (entity === "suppliers") {
    const { updateTypedSupplier } = await import("./m2Typed");
    return updateTypedSupplier(id, record);
  }
  if (entity === "shipments") {
    const { updateTypedShipment } = await import("./m2Typed");
    return updateTypedShipment(id, record);
  }
  if (entity === "warehouses") {
    const { updateTypedWarehouse } = await import("./m2Typed");
    return updateTypedWarehouse(id, record);
  }
  if (isTypedEntity(entity)) throw typedUnavailable(entity, "Editing records");
  const row = await apiFetch<RecordDto>(`${pathFor(entity)}${id}/`, {
    method: "PATCH",
    body: fromErpRecord(record, entity),
    silent: true,
  });
  return toErpRecord(row);
}

export async function deleteRecord(entity: string, id: string): Promise<void> {
  if (isTypedEntity(entity)) throw typedUnavailable(entity, "Deleting records");
  await apiFetch(`${pathFor(entity)}${id}/`, { method: "DELETE", silent: true });
}

export async function recordAction(
  entity: string,
  id: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<ErpRecord> {
  if (isTypedEntity(entity)) throw typedUnavailable(entity, `The "${action}" action`);
  const row = await apiFetch<RecordDto>(`${pathFor(entity)}${id}/${action}/`, {
    method: "POST",
    body: body ?? {},
    silent: true,
  });
  return toErpRecord(row);
}

export function isMissingResource(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 501);
}
