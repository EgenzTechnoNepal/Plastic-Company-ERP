/**
 * In-memory ERP database (mock persistence layer).
 * Every service in src/services/entities calls this store. When the Django
 * REST backend is connected, only the service implementations change —
 * components never touch this file directly.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ApprovalRequest, ApprovalRule, AuditEvent, ErpRecord, FieldAccess, NotificationItem } from "@/types/erp";
import { buildSeed } from "./seed";

export const DB_VERSION = 12;

export interface DbState {
  version: number;
  records: Record<string, ErpRecord[]>;
  audit: AuditEvent[];
  notifications: NotificationItem[];
  approvals: ApprovalRequest[];
  approvalRules: ApprovalRule[];
  permissionOverrides: Record<string, boolean>;
  fieldOverrides: Record<string, FieldAccess>;
  savedViews: Array<{ id: string; name: string; report: string; filters: Record<string, unknown>; sharedWith: string }>;
  scheduledReports: Array<{ id: string; report: string; frequency: string; recipients: string; nextRun: string; active: boolean }>;
  seq: Record<string, number>;
  setRecords: (entity: string, rows: ErpRecord[]) => void;
  patch: (fn: (s: DbState) => Partial<DbState>) => void;
  reset: () => void;
}

const defaultApprovalRules: ApprovalRule[] = [
  { id: "AR-001", documentType: "Quotation", department: "Sales", minAmount: 0, maxAmount: 50000, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 50000, active: true },
  { id: "AR-002", documentType: "Quotation", department: "Sales", minAmount: 50000, maxAmount: 500000, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-003", documentType: "Quotation", department: "Sales", minAmount: 500000, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-004", documentType: "Quotation", department: "Sales", minAmount: 500000, maxAmount: null, approverRole: "administrator", level: 2, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-005", documentType: "Purchase Order", department: "Purchase", minAmount: 0, maxAmount: 25000, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 48, autoApproveBelow: 25000, active: true },
  { id: "AR-006", documentType: "Purchase Order", department: "Purchase", minAmount: 25000, maxAmount: 1000000, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 48, autoApproveBelow: 0, active: true },
  { id: "AR-007", documentType: "Purchase Order", department: "Purchase", minAmount: 1000000, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-008", documentType: "Purchase Order", department: "Purchase", minAmount: 1000000, maxAmount: null, approverRole: "administrator", level: 2, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-009", documentType: "Leave Request", department: "HR", minAmount: 0, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-010", documentType: "Journal Voucher", department: "Accounts", minAmount: 0, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 12, autoApproveBelow: 0, active: true },
  { id: "AR-011", documentType: "Stock Adjustment", department: "Warehouse", minAmount: 0, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-012", documentType: "Expense", department: "Accounts", minAmount: 0, maxAmount: 10000, approverRole: "manager", level: 1, mode: "parallel", escalationHours: 12, autoApproveBelow: 0, active: true },
  { id: "AR-013", documentType: "Expense", department: "Accounts", minAmount: 0, maxAmount: 10000, approverRole: "hr", level: 1, mode: "parallel", escalationHours: 12, autoApproveBelow: 0, active: true },
  { id: "AR-014", documentType: "Purchase Requisition", department: "Purchase", minAmount: 0, maxAmount: 25000, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 15000, active: true },
  { id: "AR-015", documentType: "Purchase Requisition", department: "Purchase", minAmount: 25000, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
  { id: "AR-016", documentType: "Vendor Bill", department: "Accounts", minAmount: 0, maxAmount: null, approverRole: "manager", level: 1, mode: "sequential", escalationHours: 24, autoApproveBelow: 0, active: true },
];

const initialNotifications: NotificationItem[] = [
  { id: "N-1", at: "2026-08-03T04:20:00Z", type: "approval", priority: "high", title: "Leave request awaiting approval", body: "Sita Rai requested 3 days annual leave (12–14 Aug).", module: "HR", read: false, link: { entity: "leave_requests", id: "leave_requests:LV-001" } },
  { id: "N-2", at: "2026-08-02T10:05:00Z", type: "stock", priority: "high", title: "Stock below reorder level", body: "PBAT Polymer (RM-PBAT-002) is at 1,200 KG against reorder 1,500 KG.", module: "Inventory", read: false, link: { entity: "products", id: "products:RM-PBAT-002" } },
  { id: "N-3", at: "2026-07-30T09:00:00Z", type: "invoice", priority: "normal", title: "Invoice overdue", body: "INV-002 for Annapurna Foods is 18 days overdue.", module: "Accounts", read: false, link: { entity: "invoices", id: "invoices:INV-002" } },
  { id: "N-4", at: "2026-07-14T06:30:00Z", type: "quality", priority: "high", title: "NCR raised", body: "NCR-001 — seal strength below specification on BATCH-001.", module: "Quality", read: true, link: { entity: "ncrs", id: "ncrs:NCR-001" } },
  { id: "N-5", at: "2026-08-21T08:05:00Z", type: "system", priority: "high", title: "Ticket SLA overdue", body: "TKT-001 print defect for Himalayan Organic has breached the 24-hour SLA.", module: "CRM", read: false, link: { entity: "tickets", id: "tickets:TKT-001" } },
];

const initialApprovals: ApprovalRequest[] = [
  { id: "APR-001", entity: "quotations", recordId: "quotations:QT-002", recordCode: "QT-002", documentType: "Quotation", requester: "Sita Rai", department: "Sales", amount: 501600, level: 1, totalLevels: 2, dueDate: "2026-07-16", priority: "high", status: "pending", approverRole: "manager", mode: "sequential", createdAt: "2026-07-14T09:00:00Z" },
  { id: "APR-002", entity: "leave_requests", recordId: "leave_requests:LV-001", recordCode: "LV-001", documentType: "Leave Request", requester: "Sita Rai", department: "HR", amount: 0, level: 1, totalLevels: 1, dueDate: "2026-08-05", priority: "normal", status: "pending", approverRole: "manager", mode: "sequential", createdAt: "2026-08-03T04:20:00Z" },
  { id: "APR-003", entity: "stock_adjustments", recordId: "stock_adjustments:ADJ-001", recordCode: "ADJ-001", documentType: "Stock Adjustment", requester: "Hari Karki", department: "Warehouse", amount: 8400, level: 1, totalLevels: 1, dueDate: "2026-08-04", priority: "normal", status: "pending", approverRole: "manager", mode: "sequential", createdAt: "2026-07-26T11:00:00Z" },
  { id: "APR-004", entity: "purchase_requisitions", recordId: "purchase_requisitions:PR-002", recordCode: "PR-002", documentType: "Purchase Requisition", requester: "Hari Karki", department: "Purchase", amount: 615000, level: 1, totalLevels: 1, dueDate: "2026-08-20", priority: "high", status: "pending", approverRole: "manager", mode: "sequential", createdAt: "2026-08-18T06:00:00Z" },
  { id: "APR-005", entity: "purchase_bills", recordId: "purchase_bills:BILL-002", recordCode: "BILL-002", documentType: "Vendor Bill", requester: "Maya Shrestha", department: "Accounts", amount: 2169600, level: 1, totalLevels: 1, dueDate: "2026-08-18", priority: "high", status: "pending", approverRole: "manager", mode: "sequential", createdAt: "2026-08-16T08:00:00Z" },
];

function initialState() {
  return {
    version: DB_VERSION,
    records: buildSeed(),
    audit: [
      { id: "aud-seed-1", at: "2026-07-22T09:12:00Z", user: "Sita Rai", role: "sales", action: "create", module: "sales", entity: "invoices", recordId: "invoices:INV-001", recordCode: "INV-001", ip: "10.0.0.24" },
      { id: "aud-seed-2", at: "2026-07-22T09:15:00Z", user: "Anjali Basnet", role: "manager", action: "post", module: "accounting", entity: "vouchers", recordId: "vouchers:JV-001", recordCode: "JV-001", ip: "10.0.0.24" },
      { id: "aud-seed-3", at: "2026-07-15T08:50:00Z", user: "Hari Karki", role: "warehouse", action: "create", module: "purchase", entity: "grns", recordId: "grns:GRN-001", recordCode: "GRN-001", ip: "10.0.0.24" },
      { id: "aud-seed-4", at: "2026-08-03T04:20:00Z", user: "Sita Rai", role: "sales", action: "submit", module: "hr", entity: "leave_requests", recordId: "leave_requests:LV-001", recordCode: "LV-001", ip: "10.0.0.24" },
      { id: "aud-seed-5", at: "2026-07-14T09:00:00Z", user: "Sita Rai", role: "sales", action: "submit", module: "crm", entity: "quotations", recordId: "quotations:QT-002", recordCode: "QT-002", ip: "10.0.0.24" },
      { id: "aud-seed-6", at: "2026-08-01T11:00:00Z", user: "Rajesh Sharma", role: "manager", action: "view", module: "crm", entity: "quotations", recordId: "quotations:QT-002", recordCode: "QT-002", ip: "10.0.0.24" },
      { id: "aud-seed-7", at: "2026-08-02T08:10:00Z", user: "Admin", role: "administrator", action: "export", module: "sales", entity: "invoices", recordCode: "invoices", ip: "10.0.0.24", after: { count: 2 } },
      { id: "aud-seed-8", at: "2026-07-22T09:40:00Z", user: "Sita Rai", role: "sales", action: "print", module: "sales", entity: "invoices", recordId: "invoices:INV-001", recordCode: "INV-001", ip: "10.0.0.24" },
    ] as AuditEvent[],
    notifications: initialNotifications,
    approvals: initialApprovals,
    approvalRules: defaultApprovalRules,
    permissionOverrides: {},
    fieldOverrides: {},
    savedViews: [
      { id: "SV-1", name: "Overdue receivables", report: "ar-ageing", filters: { status: "overdue" }, sharedWith: "Accounts" },
    ],
    scheduledReports: [
      { id: "SCH-1", report: "Sales Register", frequency: "Weekly (Mon 08:00)", recipients: "management@ecowrap.com.np", nextRun: "2026-08-17", active: true },
    ],
    seq: {} as Record<string, number>,
  };
}

export const useDb = create<DbState>()(
  persist(
    (set) => ({
      ...initialState(),
      setRecords: (entity, rows) => set((s) => ({ records: { ...s.records, [entity]: rows } })),
      patch: (fn) => set((s) => fn(s)),
      reset: () => set(initialState()),
    }),
    {
      name: "greenflow-erp-db",
      version: DB_VERSION,
      migrate: () => initialState(),
    },
  ),
);

export const db = {
  get: () => useDb.getState(),
  set: (fn: (s: DbState) => Partial<DbState>) => useDb.setState((s) => fn(s)),
};
