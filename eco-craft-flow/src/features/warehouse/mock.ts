export type BinStatus = "available" | "near_full" | "full" | "blocked";
export type ReceiptStatus = "pending" | "partial" | "received" | "qc_hold";
export type DispatchStatus = "picking" | "packed" | "loaded" | "dispatched" | "delivered";
export type CountStatus = "scheduled" | "in_progress" | "variance" | "closed";

export interface Location {
  id: string;
  code: string;
  warehouse: string;
  zone: string;
  type: string;
  capacity: number;
  occupied: number;
  unit: string;
  status: BinStatus;
  keeper: string;
}

export interface Receipt {
  id: string;
  number: string;
  date: string;
  source: string;
  reference: string;
  item: string;
  qty: number;
  unit: string;
  bin: string;
  batch: string;
  status: ReceiptStatus;
}

export interface Dispatch {
  id: string;
  number: string;
  date: string;
  customer: string;
  reference: string;
  item: string;
  qty: number;
  unit: string;
  vehicle: string;
  driver: string;
  status: DispatchStatus;
}

export interface CountSheet {
  id: string;
  number: string;
  date: string;
  warehouse: string;
  zone: string;
  itemsCounted: number;
  itemsTotal: number;
  variance: number;
  by: string;
  status: CountStatus;
}

export const BIN_LABEL: Record<BinStatus, string> = {
  available: "Available",
  near_full: "Near Full",
  full: "Full",
  blocked: "Blocked",
};
export const RECEIPT_LABEL: Record<ReceiptStatus, string> = {
  pending: "Pending",
  partial: "Partial",
  received: "Received",
  qc_hold: "QC Hold",
};
export const DISPATCH_LABEL: Record<DispatchStatus, string> = {
  picking: "Picking",
  packed: "Packed",
  loaded: "Loaded",
  dispatched: "Dispatched",
  delivered: "Delivered",
};
export const COUNT_LABEL: Record<CountStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  variance: "Variance",
  closed: "Closed",
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
export const binTone = (s: BinStatus): Tone =>
  s === "available" ? "success" : s === "near_full" ? "warning" : s === "full" ? "info" : "danger";
export const receiptTone = (s: ReceiptStatus): Tone =>
  s === "received" ? "success" : s === "partial" ? "warning" : s === "qc_hold" ? "danger" : "neutral";
export const dispatchTone = (s: DispatchStatus): Tone =>
  s === "delivered" ? "success" : s === "dispatched" ? "info" : s === "picking" ? "neutral" : "warning";
export const countTone = (s: CountStatus): Tone =>
  s === "closed" ? "success" : s === "variance" ? "danger" : s === "in_progress" ? "warning" : "neutral";

export const LOCATIONS: Location[] = [
  { id: "l1", code: "WH-A / Rack 1", warehouse: "Raw Material Store", zone: "Zone A", type: "Pallet Rack", capacity: 12000, occupied: 8450, unit: "kg", status: "near_full", keeper: "Bikash Tamang" },
  { id: "l2", code: "WH-A / Rack 2", warehouse: "Raw Material Store", zone: "Zone A", type: "Pallet Rack", capacity: 12000, occupied: 1240, unit: "kg", status: "available", keeper: "Bikash Tamang" },
  { id: "l3", code: "WH-A / Rack 3", warehouse: "Raw Material Store", zone: "Zone A", type: "Pallet Rack", capacity: 9000, occupied: 5600, unit: "kg", status: "available", keeper: "Bikash Tamang" },
  { id: "l4", code: "WH-A / Rack 5", warehouse: "Raw Material Store", zone: "Zone B", type: "Shelf", capacity: 800, occupied: 320, unit: "kg", status: "available", keeper: "Sarita Rai" },
  { id: "l5", code: "WH-B / Bay 1", warehouse: "WIP Store", zone: "Zone C", type: "Floor Bay", capacity: 200, occupied: 148, unit: "roll", status: "near_full", keeper: "Rajan Shrestha" },
  { id: "l6", code: "WH-B / Bay 2", warehouse: "WIP Store", zone: "Zone C", type: "Floor Bay", capacity: 200, occupied: 42, unit: "roll", status: "available", keeper: "Rajan Shrestha" },
  { id: "l7", code: "WH-C / Bay 1", warehouse: "Finished Goods Store", zone: "Zone D", type: "Block Stack", capacity: 200000, occupied: 184000, unit: "pcs", status: "near_full", keeper: "Anita Gurung" },
  { id: "l8", code: "WH-C / Bay 2", warehouse: "Finished Goods Store", zone: "Zone D", type: "Block Stack", capacity: 100000, occupied: 96500, unit: "pcs", status: "full", keeper: "Anita Gurung" },
  { id: "l9", code: "WH-C / Bay 4", warehouse: "Finished Goods Store", zone: "Zone E", type: "Block Stack", capacity: 15000, occupied: 7400, unit: "roll", status: "available", keeper: "Anita Gurung" },
  { id: "l10", code: "WH-Q / Hold 1", warehouse: "Quarantine", zone: "QC Zone", type: "Caged", capacity: 5000, occupied: 1850, unit: "kg", status: "blocked", keeper: "Prakash Adhikari" },
];

export const RECEIPTS: Receipt[] = [
  { id: "r1", number: "RCV-2609", date: "2026-07-24", source: "Himalaya Bio Polymers", reference: "PO-2041", item: "PLA Compostable Resin", qty: 4000, unit: "kg", bin: "WH-A / Rack 1", batch: "B-PLA-2609", status: "received" },
  { id: "r2", number: "RCV-2610", date: "2026-07-25", source: "Everest Polychem", reference: "PO-2044", item: "PBAT Co-polymer", qty: 2500, unit: "kg", bin: "WH-Q / Hold 1", batch: "B-PBAT-2611", status: "qc_hold" },
  { id: "r3", number: "RCV-2611", date: "2026-07-26", source: "Annapurna Starch Mills", reference: "PO-2047", item: "Corn Starch Filler", qty: 3000, unit: "kg", bin: "WH-A / Rack 3", batch: "B-STA-2604", status: "received" },
  { id: "r4", number: "RCV-2612", date: "2026-07-27", source: "Kathmandu Print Pack", reference: "PO-2050", item: "Printed Packaging Carton", qty: 1800, unit: "pcs", bin: "WH-A / Rack 5", batch: "B-PKG-2652", status: "partial" },
  { id: "r5", number: "RCV-2613", date: "2026-07-28", source: "Production Line 2", reference: "PRD-1188", item: "Blown Film Roll 25µ", qty: 60, unit: "roll", bin: "WH-B / Bay 1", batch: "B-FLM-2618", status: "received" },
  { id: "r6", number: "RCV-2614", date: "2026-07-28", source: "Terai Additives Pvt Ltd", reference: "PO-2053", item: "Compostable Masterbatch (Green)", qty: 400, unit: "kg", bin: "WH-A / Rack 5", batch: "B-ADD-2607", status: "pending" },
];

export const DISPATCHES: Dispatch[] = [
  { id: "d1", number: "DN-3301", date: "2026-07-24", customer: "Bhatbhateni Supermarket", reference: "SO-1104", item: "Compostable Carry Bag 10x12", qty: 60000, unit: "pcs", vehicle: "BA 2 KHA 4412", driver: "Ram Bahadur", status: "delivered" },
  { id: "d2", number: "DN-3302", date: "2026-07-26", customer: "Salesberry Retail", reference: "SO-1108", item: "Compostable Carry Bag 14x18", qty: 24000, unit: "pcs", vehicle: "BA 5 CHA 1180", driver: "Suresh Magar", status: "dispatched" },
  { id: "d3", number: "DN-3303", date: "2026-07-27", customer: "Hotel Yak & Yeti", reference: "SO-1112", item: "Compost Bin Liner 30x37", qty: 1200, unit: "roll", vehicle: "BA 1 JHA 9022", driver: "Dipesh Thapa", status: "loaded" },
  { id: "d4", number: "DN-3304", date: "2026-07-28", customer: "Big Mart Nepal", reference: "SO-1115", item: "Garbage Bag 24x32 (Roll)", qty: 2600, unit: "roll", vehicle: "—", driver: "—", status: "packed" },
  { id: "d5", number: "DN-3305", date: "2026-07-28", customer: "Green Grocers Pokhara", reference: "SO-1117", item: "Compostable Carry Bag 10x12", qty: 35000, unit: "pcs", vehicle: "—", driver: "—", status: "picking" },
];

export const COUNTS: CountSheet[] = [
  { id: "c1", number: "CNT-0091", date: "2026-07-20", warehouse: "Raw Material Store", zone: "Zone A", itemsCounted: 24, itemsTotal: 24, variance: -18, by: "Bikash Tamang", status: "closed" },
  { id: "c2", number: "CNT-0092", date: "2026-07-24", warehouse: "Finished Goods Store", zone: "Zone D", itemsCounted: 16, itemsTotal: 16, variance: 420, by: "Anita Gurung", status: "variance" },
  { id: "c3", number: "CNT-0093", date: "2026-07-27", warehouse: "WIP Store", zone: "Zone C", itemsCounted: 7, itemsTotal: 12, variance: 0, by: "Rajan Shrestha", status: "in_progress" },
  { id: "c4", number: "CNT-0094", date: "2026-07-30", warehouse: "Quarantine", zone: "QC Zone", itemsCounted: 0, itemsTotal: 5, variance: 0, by: "Prakash Adhikari", status: "scheduled" },
];
