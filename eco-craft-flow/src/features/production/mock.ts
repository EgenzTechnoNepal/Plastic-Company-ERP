export type BomStatus = "draft" | "approved" | "obsolete";
export type OrderStatus = "draft" | "planned" | "in_progress" | "qc" | "completed" | "cancelled";
export type BatchStatus = "released" | "quarantine" | "consumed";

export interface BomLine {
  item: string;
  qty: number;
  unit: string;
  scrapPct: number;
}

export interface Bom {
  id: string;
  code: string;
  product: string;
  version: string;
  outputQty: number;
  outputUnit: string;
  costPerUnit: number;
  approvedBy: string;
  updated: string;
  status: BomStatus;
  lines: BomLine[];
}

export interface ProductionOrder {
  id: string;
  number: string;
  product: string;
  bom: string;
  plannedQty: number;
  producedQty: number;
  unit: string;
  line: string;
  supervisor: string;
  startDate: string;
  dueDate: string;
  status: OrderStatus;
}

export interface Consumption {
  id: string;
  order: string;
  item: string;
  rmBatch: string;
  plannedQty: number;
  actualQty: number;
  unit: string;
  date: string;
}

export interface FgBatch {
  id: string;
  batch: string;
  product: string;
  order: string;
  qty: number;
  unit: string;
  producedOn: string;
  expiry: string;
  rmBatches: string[];
  status: BatchStatus;
}

export const BOM_LABEL: Record<BomStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  obsolete: "Obsolete",
};

export const ORDER_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In Progress",
  qc: "In QC",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const BATCH_LABEL: Record<BatchStatus, string> = {
  released: "Released",
  quarantine: "Quarantine",
  consumed: "Consumed",
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const bomTone = (s: BomStatus): Tone =>
  s === "approved" ? "success" : s === "draft" ? "warning" : "neutral";

export const orderTone = (s: OrderStatus): Tone =>
  s === "completed" ? "success" : s === "in_progress" ? "info" : s === "qc" ? "warning" : s === "cancelled" ? "danger" : "neutral";

export const batchTone = (s: BatchStatus): Tone =>
  s === "released" ? "success" : s === "quarantine" ? "warning" : "neutral";

export const BOMS: Bom[] = [
  {
    id: "b1",
    code: "BOM-CB-001",
    product: "Compostable Carry Bag 12x16",
    version: "v3.1",
    outputQty: 1000,
    outputUnit: "pcs",
    costPerUnit: 4.85,
    approvedBy: "R. Shrestha (QA)",
    updated: "2026-07-18",
    status: "approved",
    lines: [
      { item: "PBAT Resin", qty: 6.2, unit: "kg", scrapPct: 2 },
      { item: "PLA Granules", qty: 3.1, unit: "kg", scrapPct: 2 },
      { item: "Corn Starch Filler", qty: 2.4, unit: "kg", scrapPct: 1.5 },
      { item: "Green Masterbatch", qty: 0.3, unit: "kg", scrapPct: 1 },
    ],
  },
  {
    id: "b2",
    code: "BOM-GB-002",
    product: "Compostable Garbage Bag 24x32",
    version: "v2.0",
    outputQty: 500,
    outputUnit: "pcs",
    costPerUnit: 11.4,
    approvedBy: "R. Shrestha (QA)",
    updated: "2026-06-02",
    status: "approved",
    lines: [
      { item: "PBAT Resin", qty: 7.8, unit: "kg", scrapPct: 2.5 },
      { item: "PLA Granules", qty: 2.6, unit: "kg", scrapPct: 2 },
      { item: "Corn Starch Filler", qty: 1.8, unit: "kg", scrapPct: 1.5 },
    ],
  },
  {
    id: "b3",
    code: "BOM-FW-003",
    product: "Food Wrap Sheet 10x10",
    version: "v1.4",
    outputQty: 2000,
    outputUnit: "pcs",
    costPerUnit: 2.15,
    approvedBy: "—",
    updated: "2026-08-04",
    status: "draft",
    lines: [
      { item: "PLA Granules", qty: 4.4, unit: "kg", scrapPct: 3 },
      { item: "Corn Starch Filler", qty: 1.2, unit: "kg", scrapPct: 2 },
    ],
  },
  {
    id: "b4",
    code: "BOM-CB-001",
    product: "Compostable Carry Bag 12x16",
    version: "v2.6",
    outputQty: 1000,
    outputUnit: "pcs",
    costPerUnit: 5.1,
    approvedBy: "R. Shrestha (QA)",
    updated: "2025-11-20",
    status: "obsolete",
    lines: [
      { item: "PBAT Resin", qty: 6.6, unit: "kg", scrapPct: 3 },
      { item: "PLA Granules", qty: 3.0, unit: "kg", scrapPct: 3 },
    ],
  },
];

export const PRODUCTION_ORDERS: ProductionOrder[] = [
  { id: "p1", number: "PRD-2608-011", product: "Compostable Carry Bag 12x16", bom: "BOM-CB-001 v3.1", plannedQty: 25000, producedQty: 18400, unit: "pcs", line: "Extrusion Line A", supervisor: "B. Tamang", startDate: "2026-08-07", dueDate: "2026-08-13", status: "in_progress" },
  { id: "p2", number: "PRD-2608-010", product: "Compostable Garbage Bag 24x32", bom: "BOM-GB-002 v2.0", plannedQty: 8000, producedQty: 8000, unit: "pcs", line: "Extrusion Line B", supervisor: "S. Magar", startDate: "2026-08-03", dueDate: "2026-08-09", status: "qc" },
  { id: "p3", number: "PRD-2608-009", product: "Compostable Carry Bag 12x16", bom: "BOM-CB-001 v3.1", plannedQty: 15000, producedQty: 15000, unit: "pcs", line: "Extrusion Line A", supervisor: "B. Tamang", startDate: "2026-07-29", dueDate: "2026-08-04", status: "completed" },
  { id: "p4", number: "PRD-2608-012", product: "Food Wrap Sheet 10x10", bom: "BOM-FW-003 v1.4", plannedQty: 40000, producedQty: 0, unit: "pcs", line: "Sheet Line C", supervisor: "P. Gurung", startDate: "2026-08-14", dueDate: "2026-08-20", status: "planned" },
  { id: "p5", number: "PRD-2608-013", product: "Compostable Garbage Bag 24x32", bom: "BOM-GB-002 v2.0", plannedQty: 12000, producedQty: 0, unit: "pcs", line: "Extrusion Line B", supervisor: "S. Magar", startDate: "2026-08-18", dueDate: "2026-08-24", status: "draft" },
  { id: "p6", number: "PRD-2607-008", product: "Food Wrap Sheet 10x10", bom: "BOM-FW-003 v1.3", plannedQty: 10000, producedQty: 2200, unit: "pcs", line: "Sheet Line C", supervisor: "P. Gurung", startDate: "2026-07-21", dueDate: "2026-07-26", status: "cancelled" },
];

export const CONSUMPTIONS: Consumption[] = [
  { id: "c1", order: "PRD-2608-011", item: "PBAT Resin", rmBatch: "RM-PBAT-2607-04", plannedQty: 155, actualQty: 161, unit: "kg", date: "2026-08-07" },
  { id: "c2", order: "PRD-2608-011", item: "PLA Granules", rmBatch: "RM-PLA-2607-02", plannedQty: 77.5, actualQty: 76.2, unit: "kg", date: "2026-08-07" },
  { id: "c3", order: "PRD-2608-011", item: "Corn Starch Filler", rmBatch: "RM-CS-2606-09", plannedQty: 60, actualQty: 62.5, unit: "kg", date: "2026-08-08" },
  { id: "c4", order: "PRD-2608-010", item: "PBAT Resin", rmBatch: "RM-PBAT-2606-11", plannedQty: 124.8, actualQty: 124.8, unit: "kg", date: "2026-08-03" },
  { id: "c5", order: "PRD-2608-010", item: "PLA Granules", rmBatch: "RM-PLA-2607-02", plannedQty: 41.6, actualQty: 43.1, unit: "kg", date: "2026-08-04" },
  { id: "c6", order: "PRD-2608-009", item: "PBAT Resin", rmBatch: "RM-PBAT-2606-11", plannedQty: 93, actualQty: 91.4, unit: "kg", date: "2026-07-29" },
  { id: "c7", order: "PRD-2608-009", item: "Green Masterbatch", rmBatch: "RM-MB-2605-03", plannedQty: 4.5, actualQty: 4.8, unit: "kg", date: "2026-07-30" },
];

export const FG_BATCHES: FgBatch[] = [
  { id: "f1", batch: "FG-CB-2608-31", product: "Compostable Carry Bag 12x16", order: "PRD-2608-011", qty: 18400, unit: "pcs", producedOn: "2026-08-09", expiry: "2028-08-09", rmBatches: ["RM-PBAT-2607-04", "RM-PLA-2607-02", "RM-CS-2606-09"], status: "quarantine" },
  { id: "f2", batch: "FG-GB-2608-30", product: "Compostable Garbage Bag 24x32", order: "PRD-2608-010", qty: 8000, unit: "pcs", producedOn: "2026-08-06", expiry: "2028-08-06", rmBatches: ["RM-PBAT-2606-11", "RM-PLA-2607-02"], status: "quarantine" },
  { id: "f3", batch: "FG-CB-2608-29", product: "Compostable Carry Bag 12x16", order: "PRD-2608-009", qty: 15000, unit: "pcs", producedOn: "2026-08-02", expiry: "2028-08-02", rmBatches: ["RM-PBAT-2606-11", "RM-MB-2605-03"], status: "released" },
  { id: "f4", batch: "FG-CB-2607-24", product: "Compostable Carry Bag 12x16", order: "PRD-2607-006", qty: 22000, unit: "pcs", producedOn: "2026-07-18", expiry: "2028-07-18", rmBatches: ["RM-PBAT-2605-08"], status: "consumed" },
];