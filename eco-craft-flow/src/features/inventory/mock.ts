export type ProductKind = "raw_material" | "semi_finished" | "finished_good" | "packaging";
export type MoveType = "in" | "out" | "transfer" | "adjustment";

export interface Product {
  id: string;
  sku: string;
  name: string;
  kind: ProductKind;
  category: string;
  unit: string;
  stock: number;
  reorder: number;
  cost: number;
  location: string;
  batch?: string;
  expiry?: string;
}

export interface StockMove {
  id: string;
  number: string;
  date: string;
  type: MoveType;
  sku: string;
  product: string;
  qty: number;
  unit: string;
  from?: string;
  to?: string;
  reference: string;
  by: string;
}

export const KIND_LABEL: Record<ProductKind, string> = {
  raw_material: "Raw Material",
  semi_finished: "Semi-Finished",
  finished_good: "Finished Good",
  packaging: "Packaging",
};

export const MOVE_LABEL: Record<MoveType, string> = {
  in: "Stock In",
  out: "Stock Out",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

export const PRODUCTS: Product[] = [
  { id: "p1", sku: "RM-PLA-001", name: "PLA Compostable Resin", kind: "raw_material", category: "Bio Resin", unit: "kg", stock: 8450, reorder: 3000, cost: 385, location: "WH-A / Rack 1", batch: "B-PLA-2609", expiry: "2027-03-14" },
  { id: "p2", sku: "RM-PBAT-002", name: "PBAT Co-polymer", kind: "raw_material", category: "Bio Resin", unit: "kg", stock: 1240, reorder: 2500, cost: 420, location: "WH-A / Rack 2", batch: "B-PBAT-2611", expiry: "2027-01-09" },
  { id: "p3", sku: "RM-STA-003", name: "Corn Starch Filler", kind: "raw_material", category: "Filler", unit: "kg", stock: 5600, reorder: 2000, cost: 96, location: "WH-A / Rack 3", batch: "B-STA-2604" },
  { id: "p4", sku: "RM-ADD-004", name: "Compostable Masterbatch (Green)", kind: "raw_material", category: "Additive", unit: "kg", stock: 320, reorder: 400, cost: 780, location: "WH-A / Rack 5", batch: "B-ADD-2607" },
  { id: "p5", sku: "SF-FILM-010", name: "Blown Film Roll 25µ", kind: "semi_finished", category: "Film", unit: "roll", stock: 148, reorder: 60, cost: 2450, location: "WH-B / Bay 1", batch: "B-FLM-2618" },
  { id: "p6", sku: "SF-FILM-011", name: "Blown Film Roll 40µ", kind: "semi_finished", category: "Film", unit: "roll", stock: 42, reorder: 50, cost: 3180, location: "WH-B / Bay 2", batch: "B-FLM-2620" },
  { id: "p7", sku: "FG-BAG-100", name: "Compostable Carry Bag 10x12", kind: "finished_good", category: "Carry Bag", unit: "pcs", stock: 184000, reorder: 50000, cost: 4.2, location: "WH-C / Bay 1", batch: "B-FG-2631", expiry: "2028-06-30" },
  { id: "p8", sku: "FG-BAG-140", name: "Compostable Carry Bag 14x18", kind: "finished_good", category: "Carry Bag", unit: "pcs", stock: 96500, reorder: 40000, cost: 6.8, location: "WH-C / Bay 2", batch: "B-FG-2634", expiry: "2028-06-30" },
  { id: "p9", sku: "FG-GBAG-200", name: "Garbage Bag 24x32 (Roll)", kind: "finished_good", category: "Garbage Bag", unit: "roll", stock: 7400, reorder: 9000, cost: 92, location: "WH-C / Bay 4", batch: "B-FG-2640", expiry: "2028-09-15" },
  { id: "p10", sku: "FG-LINER-300", name: "Compost Bin Liner 30L", kind: "finished_good", category: "Liner", unit: "pcs", stock: 31200, reorder: 15000, cost: 11.5, location: "WH-C / Bay 6", batch: "B-FG-2644" },
  { id: "p11", sku: "PK-CTN-500", name: "Export Carton 5-ply", kind: "packaging", category: "Carton", unit: "pcs", stock: 2100, reorder: 800, cost: 68, location: "WH-D / Rack 1" },
  { id: "p12", sku: "PK-LBL-510", name: "ISO 17088 Label Sticker", kind: "packaging", category: "Label", unit: "pcs", stock: 640, reorder: 2000, cost: 1.9, location: "WH-D / Rack 3" },
];

export const STOCK_MOVES: StockMove[] = [
  { id: "m1", number: "STK-2601", date: "2026-07-26", type: "in", sku: "RM-PLA-001", product: "PLA Compostable Resin", qty: 2000, unit: "kg", to: "WH-A / Rack 1", reference: "GRN-0142", by: "Hari Karki" },
  { id: "m2", number: "STK-2602", date: "2026-07-26", type: "out", sku: "RM-PLA-001", product: "PLA Compostable Resin", qty: 850, unit: "kg", from: "WH-A / Rack 1", reference: "PRD-0088", by: "Production" },
  { id: "m3", number: "STK-2603", date: "2026-07-25", type: "in", sku: "SF-FILM-010", product: "Blown Film Roll 25µ", qty: 36, unit: "roll", to: "WH-B / Bay 1", reference: "PRD-0088", by: "Production" },
  { id: "m4", number: "STK-2604", date: "2026-07-25", type: "transfer", sku: "FG-BAG-100", product: "Compostable Carry Bag 10x12", qty: 24000, unit: "pcs", from: "WH-B / Bay 1", to: "WH-C / Bay 1", reference: "TRF-0031", by: "Hari Karki" },
  { id: "m5", number: "STK-2605", date: "2026-07-24", type: "out", sku: "FG-BAG-140", product: "Compostable Carry Bag 14x18", qty: 18000, unit: "pcs", from: "WH-C / Bay 2", reference: "DN-0219", by: "Dispatch" },
  { id: "m6", number: "STK-2606", date: "2026-07-24", type: "adjustment", sku: "PK-LBL-510", product: "ISO 17088 Label Sticker", qty: -160, unit: "pcs", from: "WH-D / Rack 3", reference: "ADJ-0009 (damaged)", by: "Hari Karki" },
  { id: "m7", number: "STK-2607", date: "2026-07-23", type: "in", sku: "RM-STA-003", product: "Corn Starch Filler", qty: 3000, unit: "kg", to: "WH-A / Rack 3", reference: "GRN-0139", by: "Hari Karki" },
  { id: "m8", number: "STK-2608", date: "2026-07-22", type: "out", sku: "RM-PBAT-002", product: "PBAT Co-polymer", qty: 620, unit: "kg", from: "WH-A / Rack 2", reference: "PRD-0086", by: "Production" },
  { id: "m9", number: "STK-2609", date: "2026-07-22", type: "in", sku: "FG-LINER-300", product: "Compost Bin Liner 30L", qty: 12000, unit: "pcs", to: "WH-C / Bay 6", reference: "PRD-0085", by: "Production" },
  { id: "m10", number: "STK-2610", date: "2026-07-21", type: "transfer", sku: "SF-FILM-011", product: "Blown Film Roll 40µ", qty: 14, unit: "roll", from: "WH-B / Bay 2", to: "WH-B / Bay 3", reference: "TRF-0029", by: "Hari Karki" },
];

export function kindTone(kind: ProductKind): "success" | "warning" | "info" | "neutral" {
  switch (kind) {
    case "raw_material": return "info";
    case "semi_finished": return "warning";
    case "finished_good": return "success";
    case "packaging": return "neutral";
  }
}

export function moveTone(type: MoveType): "success" | "warning" | "danger" | "info" {
  switch (type) {
    case "in": return "success";
    case "out": return "danger";
    case "transfer": return "info";
    case "adjustment": return "warning";
  }
}

export const stockValue = (p: Product) => p.stock * p.cost;
export const isLow = (p: Product) => p.stock <= p.reorder;