/**
 * Django REST paths each mock service call will hit.
 * Swap createEntityService bodies for apiFetch() using these paths —
 * do not change the public service surface.
 */
export const API_V1 = "/api/v1";

export interface ResourceEndpoints {
  list: string;
  create: string;
  get: string;
  update: string;
  delete: string;
  submit: string;
  approve: string;
  reject: string;
  cancel: string;
  post: string;
  reverse: string;
}

function resource(module: string, name: string): ResourceEndpoints {
  const base = `${API_V1}/${module}/${name}`;
  return {
    list: `GET ${base}/`,
    create: `POST ${base}/`,
    get: `GET ${base}/{id}/`,
    update: `PATCH ${base}/{id}/`,
    delete: `DELETE ${base}/{id}/`,
    submit: `POST ${base}/{id}/submit/`,
    approve: `POST ${base}/{id}/approve/`,
    reject: `POST ${base}/{id}/reject/`,
    cancel: `POST ${base}/{id}/cancel/`,
    post: `POST ${base}/{id}/post/`,
    reverse: `POST ${base}/{id}/reverse/`,
  };
}

export const AUTH_ENDPOINTS = {
  login: `POST ${API_V1}/auth/login/`,
  refresh: `POST ${API_V1}/auth/refresh/`,
  logout: `POST ${API_V1}/auth/logout/`,
  passwordReset: `POST ${API_V1}/auth/password-reset/`,
  passwordResetConfirm: `POST ${API_V1}/auth/password-reset/confirm/`,
};

/** Entity key → DRF resource. Keep in lockstep with features/registry/entities.ts */
export const ENDPOINTS: Record<string, ResourceEndpoints> = {
  customers: resource("crm", "customers"),
  contacts: resource("crm", "contacts"),
  leads: resource("crm", "leads"),
  opportunities: resource("crm", "opportunities"),
  activities: resource("crm", "activities"),
  dealers: resource("crm", "dealers"),
  territories: resource("crm", "territories"),
  quotations: resource("crm", "quotations"),

  sales_orders: resource("sales", "orders"),
  deliveries: resource("sales", "deliveries"),
  invoices: resource("sales", "invoices"),
  payments: resource("sales", "payments"),
  sales_returns: resource("sales", "returns"),
  credit_notes: resource("sales", "credit-notes"),

  suppliers: resource("purchase", "suppliers"),
  purchase_requisitions: resource("purchase", "requisitions"),
  rfqs: resource("purchase", "rfqs"),
  purchase_orders: resource("purchase", "orders"),
  gate_entries: resource("purchase", "gate-entries"),
  grns: resource("purchase", "receipts"),
  purchase_bills: resource("purchase", "bills"),
  purchase_returns: resource("purchase", "returns"),
  debit_notes: resource("purchase", "debit-notes"),
  vendor_payments: resource("purchase", "payments"),
  ocr_bills: resource("purchase", "ocr-bills"),

  products: resource("inventory", "products"),
  batches: resource("inventory", "batches"),
  stock_movements: resource("inventory", "movements"),
  stock_adjustments: resource("inventory", "adjustments"),

  // Phase 1 typed masters (DomainRecord paths above remain for existing screens)
  items: resource("inventory", "items"),
  uoms: resource("inventory", "uoms"),
  uom_conversions: resource("inventory", "uom-conversions"),
  inventory_lots: resource("inventory", "lots"),
  receipt_layers: resource("inventory", "receipt-layers"),
  landed_cost_documents: resource("inventory", "landed-cost-documents"),
  landed_cost_components: resource("inventory", "landed-cost-components"),
  supplier_item_prices: resource("inventory", "supplier-item-prices"),
  vendors: resource("purchase", "vendors"),
  incoterms: resource("purchase", "incoterms"),
  facilities: resource("warehouse", "facilities"),
  zones: resource("warehouse", "zones"),
  racks: resource("warehouse", "racks"),
  storage_bins: resource("warehouse", "storage-bins"),
  customer_masters: resource("crm", "customer-masters"),

  warehouses: resource("warehouse", "warehouses"),
  bins: resource("warehouse", "bins"),
  stock_transfers: resource("warehouse", "transfers"),
  bin_transfers: resource("warehouse", "bin-transfers"),
  stock_counts: resource("warehouse", "counts"),
  quarantine: resource("quality", "quarantine"),

  boms: resource("production", "boms"),
  production_plans: resource("production", "plans"),
  mrp_runs: resource("production", "mrp"),
  work_orders: resource("production", "orders"),
  material_issues: resource("production", "issues"),
  operations: resource("production", "operations"),
  machines: resource("production", "machines"),
  machine_schedules: resource("production", "schedules"),

  quality_plans: resource("quality", "plans"),
  qc_inspections: resource("quality", "inspections"),
  ncrs: resource("quality", "ncrs"),
  capas: resource("quality", "capas"),
  instruments: resource("quality", "instruments"),
  certificates: resource("quality", "certificates"),

  employees: resource("hr", "employees"),
  attendance: resource("hr", "attendance"),
  leave_requests: resource("hr", "leaves"),
  payroll_runs: resource("hr", "payroll-runs"),
  payslips: resource("hr", "payslips"),
  performance_reviews: resource("hr", "performance"),
  recruitment: resource("hr", "recruitment"),

  accounts: resource("accounting", "accounts"),
  vouchers: resource("accounting", "vouchers"),
  expenses: resource("accounting", "expenses"),
  cost_centres: resource("accounting", "cost-centres"),
  assets: resource("accounting", "assets"),

  branches: resource("admin", "branches"),
  departments: resource("admin", "departments"),
  workflow_rules: resource("admin", "workflows"),
  whatsapp_templates: resource("admin", "whatsapp-templates"),
  rfid_tags: resource("admin", "rfid-tags"),
  iot_sensors: resource("admin", "iot-sensors"),
  backups: resource("admin", "backups"),
};

export const PLATFORM_ENDPOINTS = {
  notifications: {
    list: `GET ${API_V1}/notifications/`,
    read: `POST ${API_V1}/notifications/{id}/read/`,
    readAll: `POST ${API_V1}/notifications/read-all/`,
  },
  audit: { list: `GET ${API_V1}/audit/logs/` },
  approvals: {
    list: `GET ${API_V1}/approvals/`,
    approve: `POST ${API_V1}/approvals/{id}/approve/`,
    reject: `POST ${API_V1}/approvals/{id}/reject/`,
    return: `POST ${API_V1}/approvals/{id}/return/`,
    delegate: `POST ${API_V1}/approvals/{id}/delegate/`,
  },
};

export function endpointFor(entity: string, verb: keyof ResourceEndpoints): string {
  const res = ENDPOINTS[entity];
  if (!res) throw new Error(`No DRF path registered for entity "${entity}"`);
  return res[verb];
}