/** Core ERP domain types. These mirror the Django REST serializers that will
 *  replace the mock services later — keep field names stable. */

export type DocStatus =
  | "draft"
  | "submitted"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "returned"
  | "released"
  | "in_progress"
  | "completed"
  | "posted"
  | "reversed"
  | "cancelled"
  | "active"
  | "inactive"
  | "hold"
  | "open"
  | "closed";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_META: Record<DocStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  pending_approval: { label: "Pending Approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  returned: { label: "Returned for Info", tone: "warning" },
  released: { label: "Released", tone: "info" },
  in_progress: { label: "In Progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  posted: { label: "Posted", tone: "success" },
  reversed: { label: "Reversed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  hold: { label: "On Hold", tone: "warning" },
  open: { label: "Open", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
};

export interface LineItem {
  id: string;
  item: string;
  description?: string;
  uom?: string;
  warehouse?: string;
  batch?: string;
  serial?: string;
  qty: number;
  rate: number;
  discountPct?: number;
  taxPct?: number;
  /** debit/credit grids reuse these */
  debit?: number;
  credit?: number;
  account?: string;
  costCentre?: string;
}

export interface StatusEvent {
  id: string;
  status: DocStatus;
  by: string;
  at: string;
  comment?: string;
}

export interface ErpRecord {
  id: string;
  entity: string;
  code: string;
  title: string;
  date: string;
  status: DocStatus;
  fields: Record<string, unknown>;
  lines: LineItem[];
  history: StatusEvent[];
  links: Array<{ entity: string; id: string; label?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  user: string;
  role: string;
  action: string;
  module: string;
  entity: string;
  recordId?: string;
  recordCode?: string;
  ip: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface NotificationItem {
  id: string;
  at: string;
  type: "approval" | "rejection" | "stock" | "invoice" | "production" | "quality" | "leave" | "payroll" | "system";
  priority: "low" | "normal" | "high";
  title: string;
  body: string;
  module: string;
  read: boolean;
  link?: { entity: string; id: string };
}

export type FieldAccess = "hidden" | "readonly" | "edit";

export interface ApprovalRequest {
  id: string;
  entity: string;
  recordId: string;
  recordCode: string;
  documentType: string;
  requester: string;
  department: string;
  amount: number;
  level: number;
  totalLevels: number;
  dueDate: string;
  priority: "low" | "normal" | "high";
  status: "pending" | "approved" | "rejected" | "returned" | "delegated";
  approverRole: string;
  mode?: "sequential" | "parallel";
  delegatedTo?: string;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface ApprovalRule {
  id: string;
  documentType: string;
  department: string;
  minAmount: number;
  maxAmount: number | null;
  approverRole: string;
  level: number;
  mode: "sequential" | "parallel";
  delegateTo?: string;
  escalationHours: number;
  autoApproveBelow: number;
  active: boolean;
}

export function lineAmount(l: LineItem): number {
  const gross = (l.qty || 0) * (l.rate || 0);
  const disc = gross * ((l.discountPct || 0) / 100);
  return gross - disc;
}
export function lineTax(l: LineItem): number {
  return lineAmount(l) * ((l.taxPct || 0) / 100);
}
export function docTotals(lines: LineItem[]) {
  const subtotal = lines.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0);
  const discount = lines.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0) * ((l.discountPct || 0) / 100), 0);
  const tax = lines.reduce((s, l) => s + lineTax(l), 0);
  const net = subtotal - discount;
  return { subtotal, discount, taxable: net, tax, total: net + tax };
}
