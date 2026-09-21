export type OrderStatus = "draft" | "confirmed" | "in_production" | "ready" | "dispatched" | "delivered" | "cancelled";
export type InvoiceStatus = "unpaid" | "partial" | "paid" | "overdue";
export type PaymentMode = "cash" | "bank_transfer" | "cheque" | "esewa" | "khalti";

export interface SalesOrder {
  id: string;
  number: string;
  customer: string;
  date: string;
  delivery: string;
  items: number;
  amount: number;
  status: OrderStatus;
  paid: number;
}

export interface Invoice {
  id: string;
  number: string;
  orderRef: string;
  customer: string;
  date: string;
  due: string;
  amount: number;
  paid: number;
  status: InvoiceStatus;
}

export interface Payment {
  id: string;
  number: string;
  invoiceRef: string;
  customer: string;
  date: string;
  mode: PaymentMode;
  amount: number;
  reference: string;
}

export const SALES_ORDERS: SalesOrder[] = [
  { id: "s1", number: "SO-2026-0231", customer: "Himalayan Organic Foods", date: "2026-07-18", delivery: "2026-07-25", items: 4, amount: 245000, status: "confirmed", paid: 100000 },
  { id: "s2", number: "SO-2026-0230", customer: "Everest Retail Chain", date: "2026-07-17", delivery: "2026-07-24", items: 6, amount: 512000, status: "in_production", paid: 200000 },
  { id: "s3", number: "SO-2026-0229", customer: "GreenPack Nepal", date: "2026-07-16", delivery: "2026-07-23", items: 3, amount: 178000, status: "ready", paid: 178000 },
  { id: "s4", number: "SO-2026-0228", customer: "Ministry of Environment", date: "2026-07-14", delivery: "2026-07-28", items: 8, amount: 1240000, status: "dispatched", paid: 500000 },
  { id: "s5", number: "SO-2026-0227", customer: "BioWrap Distributors Pvt. Ltd.", date: "2026-07-10", delivery: "2026-07-17", items: 5, amount: 385000, status: "delivered", paid: 385000 },
  { id: "s6", number: "SO-2026-0226", customer: "Kaski Grocers Cooperative", date: "2026-07-08", delivery: "2026-07-15", items: 2, amount: 96000, status: "delivered", paid: 96000 },
  { id: "s7", number: "SO-2026-0225", customer: "Chitwan Farm Fresh", date: "2026-07-05", delivery: "2026-07-12", items: 3, amount: 168000, status: "cancelled", paid: 0 },
];

export const INVOICES: Invoice[] = [
  { id: "i1", number: "INV-2026-0187", orderRef: "SO-2026-0230", customer: "Everest Retail Chain", date: "2026-07-17", due: "2026-08-16", amount: 512000, paid: 200000, status: "partial" },
  { id: "i2", number: "INV-2026-0186", orderRef: "SO-2026-0229", customer: "GreenPack Nepal", date: "2026-07-16", due: "2026-08-15", amount: 178000, paid: 178000, status: "paid" },
  { id: "i3", number: "INV-2026-0185", orderRef: "SO-2026-0228", customer: "Ministry of Environment", date: "2026-07-14", due: "2026-08-13", amount: 1240000, paid: 500000, status: "partial" },
  { id: "i4", number: "INV-2026-0184", orderRef: "SO-2026-0227", customer: "BioWrap Distributors Pvt. Ltd.", date: "2026-07-10", due: "2026-08-09", amount: 385000, paid: 385000, status: "paid" },
  { id: "i5", number: "INV-2026-0183", orderRef: "SO-2026-0226", customer: "Kaski Grocers Cooperative", date: "2026-07-08", due: "2026-08-07", amount: 96000, paid: 96000, status: "paid" },
  { id: "i6", number: "INV-2026-0182", orderRef: "SO-2026-0224", customer: "Annapurna Foods Ltd.", date: "2026-06-15", due: "2026-07-15", amount: 420000, paid: 0, status: "overdue" },
  { id: "i7", number: "INV-2026-0181", orderRef: "SO-2026-0223", customer: "TrekWorld Nepal", date: "2026-06-20", due: "2026-07-20", amount: 155000, paid: 0, status: "unpaid" },
];

export const PAYMENTS: Payment[] = [
  { id: "p1", number: "PAY-2026-0311", invoiceRef: "INV-2026-0187", customer: "Everest Retail Chain", date: "2026-07-17", mode: "bank_transfer", amount: 200000, reference: "NIC-TXN-88291" },
  { id: "p2", number: "PAY-2026-0310", invoiceRef: "INV-2026-0186", customer: "GreenPack Nepal", date: "2026-07-16", mode: "cheque", amount: 178000, reference: "CHQ-441209" },
  { id: "p3", number: "PAY-2026-0309", invoiceRef: "INV-2026-0185", customer: "Ministry of Environment", date: "2026-07-14", mode: "bank_transfer", amount: 500000, reference: "RBB-TXN-77410" },
  { id: "p4", number: "PAY-2026-0308", invoiceRef: "INV-2026-0184", customer: "BioWrap Distributors Pvt. Ltd.", date: "2026-07-11", mode: "esewa", amount: 385000, reference: "ESW-2K88291" },
  { id: "p5", number: "PAY-2026-0307", invoiceRef: "INV-2026-0183", customer: "Kaski Grocers Cooperative", date: "2026-07-09", mode: "khalti", amount: 96000, reference: "KHL-99123" },
  { id: "p6", number: "PAY-2026-0306", invoiceRef: "INV-2026-0180", customer: "Chitwan Farm Fresh", date: "2026-07-06", mode: "cash", amount: 68000, reference: "CASH-RCP-0092" },
];

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "info" },
  in_production: { label: "In Production", tone: "warning" },
  ready: { label: "Ready", tone: "warning" },
  dispatched: { label: "Dispatched", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function invoiceTone(status: InvoiceStatus): "info" | "warning" | "success" | "danger" | "neutral" {
  switch (status) {
    case "paid": return "success";
    case "partial": return "warning";
    case "unpaid": return "info";
    case "overdue": return "danger";
  }
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  esewa: "eSewa",
  khalti: "Khalti",
};