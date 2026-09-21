import { getEntity, type EntityDef } from "@/features/registry/entities";

export interface EntityPath {
  module: string;
  slug: string;
  entity: string;
}

/** URL slug under a module → store entity. First match is the canonical list. */
export const ENTITY_PATHS: EntityPath[] = [
  { module: "crm", slug: "customers", entity: "customers" },
  { module: "crm", slug: "contacts", entity: "contacts" },
  { module: "crm", slug: "leads", entity: "leads" },
  { module: "crm", slug: "opportunities", entity: "opportunities" },
  { module: "crm", slug: "activities", entity: "activities" },
  { module: "crm", slug: "territories", entity: "territories" },
  { module: "crm", slug: "dealers", entity: "dealers" },
  { module: "crm", slug: "tickets", entity: "tickets" },
  { module: "crm", slug: "quotations", entity: "quotations" },
  { module: "sales", slug: "orders", entity: "sales_orders" },
  { module: "sales", slug: "deliveries", entity: "deliveries" },
  { module: "sales", slug: "invoices", entity: "invoices" },
  { module: "sales", slug: "payments", entity: "payments" },
  { module: "sales", slug: "returns", entity: "sales_returns" },
  { module: "sales", slug: "credit-notes", entity: "credit_notes" },
  { module: "purchase", slug: "suppliers", entity: "suppliers" },
  { module: "purchase", slug: "requisitions", entity: "purchase_requisitions" },
  { module: "purchase", slug: "rfqs", entity: "rfqs" },
  { module: "purchase", slug: "orders", entity: "purchase_orders" },
  { module: "purchase", slug: "gate-entries", entity: "gate_entries" },
  { module: "purchase", slug: "receipts", entity: "grns" },
  { module: "purchase", slug: "bills", entity: "purchase_bills" },
  { module: "purchase", slug: "ocr", entity: "ocr_bills" },
  { module: "purchase", slug: "payments", entity: "vendor_payments" },
  { module: "purchase", slug: "returns", entity: "purchase_returns" },
  { module: "purchase", slug: "debit-notes", entity: "debit_notes" },
  { module: "inventory", slug: "products", entity: "products" },
  { module: "inventory", slug: "planning", entity: "warehouse_item_plans" },
  { module: "inventory", slug: "movements", entity: "stock_movements" },
  { module: "inventory", slug: "adjustments", entity: "stock_adjustments" },
  { module: "inventory", slug: "alerts", entity: "products" },
  { module: "warehouse", slug: "warehouses", entity: "warehouses" },
  { module: "warehouse", slug: "locations", entity: "bins" },
  { module: "warehouse", slug: "putaway", entity: "grns" },
  { module: "warehouse", slug: "receiving", entity: "grns" },
  { module: "warehouse", slug: "picking", entity: "sales_orders" },
  { module: "warehouse", slug: "packing", entity: "sales_orders" },
  { module: "warehouse", slug: "dispatch", entity: "deliveries" },
  { module: "warehouse", slug: "transfers", entity: "stock_transfers" },
  { module: "warehouse", slug: "bin-transfers", entity: "bin_transfers" },
  { module: "warehouse", slug: "count", entity: "stock_counts" },
  { module: "warehouse", slug: "quarantine", entity: "quarantine" },
  { module: "production", slug: "plans", entity: "production_plans" },
  { module: "production", slug: "bom", entity: "boms" },
  { module: "production", slug: "orders", entity: "work_orders" },
  { module: "production", slug: "mrp", entity: "mrp_runs" },
  { module: "production", slug: "issues", entity: "material_issues" },
  { module: "production", slug: "consumption", entity: "material_issues" },
  { module: "production", slug: "operations", entity: "operations" },
  { module: "production", slug: "scheduling", entity: "machine_schedules" },
  { module: "production", slug: "batches", entity: "batches" },
  { module: "production", slug: "machines", entity: "machines" },
  { module: "quality-control", slug: "plans", entity: "quality_plans" },
  { module: "quality-control", slug: "incoming", entity: "qc_inspections" },
  { module: "quality-control", slug: "in-process", entity: "qc_inspections" },
  { module: "quality-control", slug: "finished", entity: "qc_inspections" },
  { module: "quality-control", slug: "instruments", entity: "instruments" },
  { module: "quality-control", slug: "coa", entity: "certificates" },
  { module: "quality-control", slug: "quarantine", entity: "quarantine" },
  { module: "quality-control", slug: "ncr", entity: "ncrs" },
  { module: "quality-control", slug: "capa", entity: "capas" },
  { module: "hr", slug: "employees", entity: "employees" },
  { module: "hr", slug: "departments", entity: "departments" },
  { module: "hr", slug: "attendance", entity: "attendance" },
  { module: "hr", slug: "leave", entity: "leave_requests" },
  { module: "hr", slug: "payroll", entity: "payslips" },
  { module: "hr", slug: "payroll-runs", entity: "payroll_runs" },
  { module: "hr", slug: "recruitment", entity: "recruitment" },
  { module: "hr", slug: "performance", entity: "performance_reviews" },
  { module: "accounting", slug: "chart", entity: "accounts" },
  { module: "accounting", slug: "vouchers", entity: "vouchers" },
  { module: "accounting", slug: "expenses", entity: "expenses" },
  { module: "accounting", slug: "cash-bank", entity: "accounts" },
  { module: "accounting", slug: "assets", entity: "assets" },
];

const SKIP_CANONICAL = new Set(["alerts", "receiving", "in-process", "finished", "putaway", "picking", "packing", "consumption", "cash-bank"]);

export function resolveEntity(module: string, slug: string): EntityDef | undefined {
  const row = ENTITY_PATHS.find((p) => p.module === module && p.slug === slug);
  if (row) return getEntity(row.entity);
  return getEntity(slug);
}

export function entityKeyFor(module: string, slug: string): string | undefined {
  return ENTITY_PATHS.find((p) => p.module === module && p.slug === slug)?.entity ?? (getEntity(slug) ? slug : undefined);
}

export function listPathFor(entity: string): string {
  const row = ENTITY_PATHS.find((p) => p.entity === entity && !SKIP_CANONICAL.has(p.slug));
  if (!row) {
    const fallback = ENTITY_PATHS.find((p) => p.entity === entity);
    return fallback ? `/${fallback.module}/${fallback.slug}` : "/dashboard";
  }
  return `/${row.module}/${row.slug}`;
}

export function recordPath(entity: string, code: string): string {
  return `${listPathFor(entity)}/${encodeURIComponent(code)}`;
}

export function recordEditPath(entity: string, code: string): string {
  return `${recordPath(entity, code)}/edit`;
}

export function recordNewPath(entity: string): string {
  return `${listPathFor(entity)}/new`;
}

export function parseRecordLocation(pathname: string): { module: string; slug: string; id?: string; isNew: boolean; isEdit: boolean; isPreview: boolean } | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const [module, slug, third, fourth] = parts;
  return {
    module,
    slug,
    id: third && third !== "new" ? decodeURIComponent(third) : undefined,
    isNew: third === "new",
    isEdit: fourth === "edit",
    isPreview: fourth === "preview",
  };
}
