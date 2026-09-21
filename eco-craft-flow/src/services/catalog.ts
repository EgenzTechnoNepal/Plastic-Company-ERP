import { createEntityService, type EntityService } from "@/services/entityService";
import { ENTITIES } from "@/features/registry/entities";
import type { FormValues } from "@/features/forms/types";

/** Form-definition key → mock-store entity key. */
export const FORM_ENTITY: Record<string, string> = {
  customer: "customers",
  contact: "contacts",
  lead: "leads",
  opportunity: "opportunities",
  activity: "activities",
  territory: "territories",
  ticket: "tickets",
  quotation: "quotations",
  salesOrder: "sales_orders",
  invoice: "invoices",
  payment: "payments",
  salesReturn: "sales_returns",
  creditNote: "credit_notes",
  delivery: "deliveries",
  dealer: "dealers",
  supplier: "suppliers",
  purchaseRequisition: "purchase_requisitions",
  rfq: "rfqs",
  purchaseOrder: "purchase_orders",
  gateEntry: "gate_entries",
  goodsReceipt: "grns",
  vendorBill: "purchase_bills",
  purchaseReturn: "purchase_returns",
  debitNote: "debit_notes",
  vendorPayment: "vendor_payments",
  product: "products",
  stockMovement: "stock_movements",
  stockAdjustment: "stock_adjustments",
  warehouse: "warehouses",
  warehouseLocation: "bins",
  stockTransfer: "stock_transfers",
  binTransfer: "bin_transfers",
  stockCount: "stock_counts",
  bom: "boms",
  productionOrder: "work_orders",
  productionPlan: "production_plans",
  mrpRun: "mrp_runs",
  materialIssue: "material_issues",
  operation: "operations",
  fgBatch: "batches",
  machineSchedule: "machine_schedules",
  qcInspection: "qc_inspections",
  ncr: "ncrs",
  capa: "capas",
  qualityPlan: "quality_plans",
  instrument: "instruments",
  certificate: "certificates",
  employee: "employees",
  leave: "leave_requests",
  payrollRun: "payroll_runs",
  voucher: "vouchers",
  expense: "expenses",
  ocrBill: "ocr_bills",
  machine: "machines",
  recruitment: "recruitment",
  performanceReview: "performance_reviews",
  account: "accounts",
  asset: "assets",
};

const cache = new Map<string, EntityService>();

export function getService(entity: string): EntityService {
  let svc = cache.get(entity);
  if (!svc) {
    const def = ENTITIES.find((e) => e.key === entity);
    svc = createEntityService(entity, { module: def?.module ?? entity });
    cache.set(entity, svc);
  }
  return svc;
}

export function getServiceForForm(formKey: string): EntityService | undefined {
  const entity = FORM_ENTITY[formKey];
  return entity ? getService(entity) : undefined;
}

/** Persist a schema-driven form payload as an ErpRecord. */
export async function createFromForm(formKey: string, values: FormValues) {
  const svc = getServiceForForm(formKey);
  if (!svc) throw new Error(`No entity mapped for form "${formKey}"`);
  const fields = { ...values } as Record<string, unknown>;
  const code = typeof fields.code === "string" && fields.code ? String(fields.code) : undefined;
  delete fields.code;
  const title = String(
    fields.name ?? fields.company ?? fields.title ?? fields.narration ?? fields.subject ?? code ?? "",
  );
  if (fields.name && !fields.customerName && formKey !== "customer" && formKey !== "supplier" && formKey !== "employee" && formKey !== "product") {
    /* keep name in fields */
  }
  return svc.create({
    code,
    title: title || undefined,
    fields,
  });
}