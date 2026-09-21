export type SupplierType = "raw_material" | "packaging" | "consumable" | "service";
export type PoStatus = "draft" | "sent" | "confirmed" | "partial_received" | "received" | "cancelled";
export type GrnStatus = "pending_qc" | "accepted" | "rejected" | "partial";
export type VendorPayMode = "cash" | "bank_transfer" | "cheque";

export interface Supplier {
  id: string;
  code: string;
  name: string;
  type: SupplierType;
  contact: string;
  phone: string;
  city: string;
  outstanding: number;
  rating: number; // 1-5
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  date: string;
  expected: string;
  items: number;
  amount: number;
  received: number; // amount value received
  status: PoStatus;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  poRef: string;
  supplier: string;
  date: string;
  batch: string;
  items: number;
  status: GrnStatus;
  qcNote?: string;
}

export interface VendorPayment {
  id: string;
  number: string;
  supplier: string;
  date: string;
  mode: VendorPayMode;
  amount: number;
  reference: string;
  poRef: string;
}

export const SUPPLIERS: Supplier[] = [
  { id: "sup1", code: "SUP-001", name: "BioResin Industries Pvt. Ltd.", type: "raw_material", contact: "Anil Thapa", phone: "+977-9841-220011", city: "Birgunj", outstanding: 485000, rating: 5 },
  { id: "sup2", code: "SUP-002", name: "PolyGreen Compounds", type: "raw_material", contact: "Sunita Maharjan", phone: "+977-9851-334422", city: "Kathmandu", outstanding: 128000, rating: 4 },
  { id: "sup3", code: "SUP-003", name: "EcoFilm Additives Co.", type: "raw_material", contact: "Ramesh Gurung", phone: "+977-9801-556677", city: "Pokhara", outstanding: 0, rating: 4 },
  { id: "sup4", code: "SUP-004", name: "Nepal Carton & Print", type: "packaging", contact: "Bimala Shrestha", phone: "+977-9861-778899", city: "Lalitpur", outstanding: 62000, rating: 5 },
  { id: "sup5", code: "SUP-005", name: "Kathmandu Chem Supplies", type: "consumable", contact: "Dipesh Karki", phone: "+977-9812-990011", city: "Kathmandu", outstanding: 24500, rating: 3 },
  { id: "sup6", code: "SUP-006", name: "Himalaya Logistics", type: "service", contact: "Prakash Sharma", phone: "+977-9841-441122", city: "Kathmandu", outstanding: 0, rating: 4 },
];

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  { id: "po1", number: "PO-2026-0412", supplier: "BioResin Industries Pvt. Ltd.", date: "2026-07-18", expected: "2026-07-26", items: 3, amount: 685000, received: 0, status: "confirmed" },
  { id: "po2", number: "PO-2026-0411", supplier: "PolyGreen Compounds", date: "2026-07-17", expected: "2026-07-24", items: 2, amount: 240000, received: 120000, status: "partial_received" },
  { id: "po3", number: "PO-2026-0410", supplier: "EcoFilm Additives Co.", date: "2026-07-15", expected: "2026-07-22", items: 4, amount: 158000, received: 158000, status: "received" },
  { id: "po4", number: "PO-2026-0409", supplier: "Nepal Carton & Print", date: "2026-07-14", expected: "2026-07-21", items: 5, amount: 92000, received: 92000, status: "received" },
  { id: "po5", number: "PO-2026-0408", supplier: "Kathmandu Chem Supplies", date: "2026-07-12", expected: "2026-07-19", items: 2, amount: 48500, received: 0, status: "sent" },
  { id: "po6", number: "PO-2026-0407", supplier: "BioResin Industries Pvt. Ltd.", date: "2026-07-10", expected: "2026-07-17", items: 3, amount: 512000, received: 512000, status: "received" },
  { id: "po7", number: "PO-2026-0406", supplier: "PolyGreen Compounds", date: "2026-07-05", expected: "2026-07-12", items: 1, amount: 78000, received: 0, status: "cancelled" },
];

export const GOODS_RECEIPTS: GoodsReceipt[] = [
  { id: "g1", number: "GRN-2026-0298", poRef: "PO-2026-0411", supplier: "PolyGreen Compounds", date: "2026-07-19", batch: "BR-25-0719-A", items: 1, status: "accepted", qcNote: "Melt flow within spec" },
  { id: "g2", number: "GRN-2026-0297", poRef: "PO-2026-0410", supplier: "EcoFilm Additives Co.", date: "2026-07-18", batch: "AD-25-0718-B", items: 4, status: "accepted", qcNote: "Passed FTIR check" },
  { id: "g3", number: "GRN-2026-0296", poRef: "PO-2026-0409", supplier: "Nepal Carton & Print", date: "2026-07-17", batch: "CT-25-0717-A", items: 5, status: "accepted" },
  { id: "g4", number: "GRN-2026-0295", poRef: "PO-2026-0412", supplier: "BioResin Industries Pvt. Ltd.", date: "2026-07-19", batch: "BR-25-0719-C", items: 2, status: "pending_qc", qcNote: "Sample sent to lab" },
  { id: "g5", number: "GRN-2026-0294", poRef: "PO-2026-0407", supplier: "BioResin Industries Pvt. Ltd.", date: "2026-07-13", batch: "BR-25-0713-A", items: 3, status: "partial", qcNote: "1 of 3 lots quarantined" },
  { id: "g6", number: "GRN-2026-0293", poRef: "PO-2026-0405", supplier: "Kathmandu Chem Supplies", date: "2026-07-08", batch: "KC-25-0708-A", items: 1, status: "rejected", qcNote: "Moisture over 0.5%" },
];

export const VENDOR_PAYMENTS: VendorPayment[] = [
  { id: "vp1", number: "VP-2026-0221", supplier: "BioResin Industries Pvt. Ltd.", date: "2026-07-18", mode: "bank_transfer", amount: 300000, reference: "NIC-OUT-55112", poRef: "PO-2026-0407" },
  { id: "vp2", number: "VP-2026-0220", supplier: "PolyGreen Compounds", date: "2026-07-16", mode: "bank_transfer", amount: 120000, reference: "NIC-OUT-55098", poRef: "PO-2026-0411" },
  { id: "vp3", number: "VP-2026-0219", supplier: "EcoFilm Additives Co.", date: "2026-07-15", mode: "cheque", amount: 158000, reference: "CHQ-778821", poRef: "PO-2026-0410" },
  { id: "vp4", number: "VP-2026-0218", supplier: "Nepal Carton & Print", date: "2026-07-14", mode: "bank_transfer", amount: 92000, reference: "NIC-OUT-55044", poRef: "PO-2026-0409" },
  { id: "vp5", number: "VP-2026-0217", supplier: "Himalaya Logistics", date: "2026-07-11", mode: "cash", amount: 18500, reference: "CASH-VCH-0182", poRef: "PO-2026-0400" },
];

export const SUPPLIER_TYPE_LABEL: Record<SupplierType, string> = {
  raw_material: "Raw Material",
  packaging: "Packaging",
  consumable: "Consumable",
  service: "Service",
};

export const PO_STATUS_META: Record<PoStatus, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  confirmed: { label: "Confirmed", tone: "info" },
  partial_received: { label: "Partial", tone: "warning" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const GRN_STATUS_META: Record<GrnStatus, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  pending_qc: { label: "Pending QC", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const VENDOR_PAY_MODE_LABEL: Record<VendorPayMode, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
};