export type VoucherType = "receipt" | "payment" | "journal" | "contra";
export type VoucherStatus = "posted" | "draft" | "cancelled";
export type PayMode = "cash" | "bank" | "cheque" | "esewa" | "khalti";

export interface Voucher {
  id: string;
  number: string;
  date: string;
  type: VoucherType;
  party: string;
  narration: string;
  mode: PayMode;
  account: string;
  amount: number;
  status: VoucherStatus;
}

export interface Expense {
  id: string;
  number: string;
  date: string;
  category: string;
  payee: string;
  note: string;
  mode: PayMode;
  amount: number;
  status: "paid" | "pending";
}

export interface CashAccount {
  id: string;
  name: string;
  kind: "cash" | "bank" | "wallet";
  detail: string;
  opening: number;
  inflow: number;
  outflow: number;
}

export interface Outstanding {
  id: string;
  party: string;
  side: "receivable" | "payable";
  reference: string;
  dueDate: string;
  daysOverdue: number;
  total: number;
  paid: number;
}

export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  receipt: "Receipt",
  payment: "Payment",
  journal: "Journal",
  contra: "Contra",
};

export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = {
  posted: "Posted",
  draft: "Draft",
  cancelled: "Cancelled",
};

export const PAY_MODE_LABEL: Record<PayMode, string> = {
  cash: "Cash",
  bank: "Bank Transfer",
  cheque: "Cheque",
  esewa: "eSewa",
  khalti: "Khalti",
};

export function voucherTone(s: VoucherStatus) {
  return s === "posted" ? "success" : s === "draft" ? "warning" : "danger";
}

export const VOUCHERS: Voucher[] = [
  { id: "v1", number: "RV-2081-041", date: "2026-08-12", type: "receipt", party: "Bhatbhateni Supermarket", narration: "Against INV-2081-118", mode: "bank", account: "NIC Asia – 0012", amount: 845000, status: "posted" },
  { id: "v2", number: "PV-2081-063", date: "2026-08-12", type: "payment", party: "Shivam Polymers Pvt. Ltd.", narration: "PO-2081-032 part payment", mode: "cheque", account: "Nabil Bank – 4471", amount: 620000, status: "posted" },
  { id: "v3", number: "RV-2081-042", date: "2026-08-11", type: "receipt", party: "Sales Berry Retail", narration: "Advance for SO-2081-077", mode: "esewa", account: "eSewa Merchant", amount: 125000, status: "posted" },
  { id: "v4", number: "JV-2081-009", date: "2026-08-10", type: "journal", party: "Depreciation – Extruder Line 2", narration: "Monthly depreciation entry", mode: "cash", account: "Fixed Assets", amount: 78000, status: "posted" },
  { id: "v5", number: "CV-2081-004", date: "2026-08-09", type: "contra", party: "Cash → Nabil Bank", narration: "Cash deposit to bank", mode: "cash", account: "Nabil Bank – 4471", amount: 300000, status: "posted" },
  { id: "v6", number: "PV-2081-064", date: "2026-08-09", type: "payment", party: "Himalayan Ink & Chem", narration: "GRN-2081-051 settlement", mode: "bank", account: "NIC Asia – 0012", amount: 214500, status: "draft" },
  { id: "v7", number: "RV-2081-043", date: "2026-08-08", type: "receipt", party: "Green Mart Nepal", narration: "INV-2081-115 full settlement", mode: "khalti", account: "Khalti Merchant", amount: 96400, status: "posted" },
  { id: "v8", number: "PV-2081-065", date: "2026-08-06", type: "payment", party: "Nepal Electricity Authority", narration: "Shrawan factory power bill", mode: "bank", account: "NIC Asia – 0012", amount: 412300, status: "posted" },
  { id: "v9", number: "RV-2081-044", date: "2026-08-05", type: "receipt", party: "Bagmati Packaging Traders", narration: "Cheque received – INV-2081-110", mode: "cheque", account: "Nabil Bank – 4471", amount: 358000, status: "cancelled" },
];

export const EXPENSES: Expense[] = [
  { id: "e1", number: "EXP-2081-088", date: "2026-08-12", category: "Utilities", payee: "Nepal Electricity Authority", note: "Factory power – Shrawan", mode: "bank", amount: 412300, status: "paid" },
  { id: "e2", number: "EXP-2081-089", date: "2026-08-11", category: "Logistics", payee: "Sagarmatha Transport", note: "Dispatch freight – 6 trips", mode: "cash", amount: 87500, status: "paid" },
  { id: "e3", number: "EXP-2081-090", date: "2026-08-10", category: "Maintenance", payee: "Everest Engineering Works", note: "Extruder screw servicing", mode: "cheque", amount: 145000, status: "pending" },
  { id: "e4", number: "EXP-2081-091", date: "2026-08-09", category: "Compliance", payee: "Nepal Bureau of Standards", note: "ISO 17088 renewal testing fee", mode: "bank", amount: 236000, status: "paid" },
  { id: "e5", number: "EXP-2081-092", date: "2026-08-08", category: "Office", payee: "Kantipur Stationers", note: "Admin supplies", mode: "esewa", amount: 18400, status: "paid" },
  { id: "e6", number: "EXP-2081-093", date: "2026-08-07", category: "Marketing", payee: "Digital Peak Media", note: "Trade fair booth – Bhrikutimandap", mode: "bank", amount: 95000, status: "pending" },
  { id: "e7", number: "EXP-2081-094", date: "2026-08-05", category: "Salary Advance", payee: "Production staff", note: "Festival advance – 6 staff", mode: "cash", amount: 120000, status: "paid" },
];

export const ACCOUNTS: CashAccount[] = [
  { id: "a1", name: "NIC Asia – 0012", kind: "bank", detail: "Current account · Balaju branch", opening: 4250000, inflow: 1866400, outflow: 1258800 },
  { id: "a2", name: "Nabil Bank – 4471", kind: "bank", detail: "Operating account · Kathmandu", opening: 2180000, inflow: 658000, outflow: 765000 },
  { id: "a3", name: "Factory Petty Cash", kind: "cash", detail: "Held by accounts officer", opening: 320000, inflow: 300000, outflow: 207500 },
  { id: "a4", name: "eSewa Merchant", kind: "wallet", detail: "Retail collections", opening: 84000, inflow: 143400, outflow: 18400 },
  { id: "a5", name: "Khalti Merchant", kind: "wallet", detail: "Retail collections", opening: 41000, inflow: 96400, outflow: 0 },
];

export const OUTSTANDING: Outstanding[] = [
  { id: "o1", party: "Bhatbhateni Supermarket", side: "receivable", reference: "INV-2081-118", dueDate: "2026-08-20", daysOverdue: 0, total: 1245000, paid: 845000 },
  { id: "o2", party: "Green Mart Nepal", side: "receivable", reference: "INV-2081-121", dueDate: "2026-08-02", daysOverdue: 13, total: 486000, paid: 100000 },
  { id: "o3", party: "Bagmati Packaging Traders", side: "receivable", reference: "INV-2081-110", dueDate: "2026-07-25", daysOverdue: 21, total: 358000, paid: 0 },
  { id: "o4", party: "Sales Berry Retail", side: "receivable", reference: "INV-2081-124", dueDate: "2026-08-28", daysOverdue: 0, total: 292000, paid: 125000 },
  { id: "o5", party: "Shivam Polymers Pvt. Ltd.", side: "payable", reference: "PO-2081-032", dueDate: "2026-08-18", daysOverdue: 0, total: 1480000, paid: 620000 },
  { id: "o6", party: "Himalayan Ink & Chem", side: "payable", reference: "GRN-2081-051", dueDate: "2026-08-04", daysOverdue: 11, total: 214500, paid: 0 },
  { id: "o7", party: "Annapurna Packaging Films", side: "payable", reference: "PO-2081-029", dueDate: "2026-07-30", daysOverdue: 16, total: 640000, paid: 240000 },
];

export const PROFIT_SUMMARY = [
  { month: "Baisakh", income: 6120000, expense: 4380000 },
  { month: "Jestha", income: 6740000, expense: 4710000 },
  { month: "Ashadh", income: 7180000, expense: 5240000 },
  { month: "Shrawan", income: 6890000, expense: 4960000 },
  { month: "Bhadra", income: 7620000, expense: 5180000 },
];