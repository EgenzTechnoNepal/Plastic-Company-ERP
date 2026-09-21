export type QcResult = "pending" | "passed" | "failed" | "rework";
export type QuarantineStatus = "held" | "released" | "rejected" | "scrapped";

export interface IncomingQc {
  id: string;
  number: string;
  date: string;
  supplier: string;
  grn: string;
  item: string;
  batch: string;
  qty: number;
  unit: string;
  sampleSize: number;
  defects: number;
  inspector: string;
  result: QcResult;
}

export interface InProcessQc {
  id: string;
  number: string;
  date: string;
  order: string;
  product: string;
  stage: string;
  parameter: string;
  spec: string;
  observed: string;
  inspector: string;
  result: QcResult;
}

export interface FinishedQc {
  id: string;
  number: string;
  date: string;
  batch: string;
  product: string;
  qty: number;
  unit: string;
  disintegration: string;
  biodegradation: string;
  heavyMetals: string;
  certRef: string;
  inspector: string;
  result: QcResult;
}

export interface QuarantineItem {
  id: string;
  batch: string;
  item: string;
  type: "Raw Material" | "Finished Goods" | "Semi-finished";
  qty: number;
  unit: string;
  bin: string;
  reason: string;
  heldOn: string;
  status: QuarantineStatus;
}

export const QC_LABEL: Record<QcResult, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  rework: "Rework",
};

export const QUARANTINE_LABEL: Record<QuarantineStatus, string> = {
  held: "On Hold",
  released: "Released",
  rejected: "Rejected",
  scrapped: "Scrapped",
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const qcTone = (r: QcResult): Tone =>
  r === "passed" ? "success" : r === "failed" ? "danger" : r === "rework" ? "warning" : "neutral";

export const quarantineTone = (s: QuarantineStatus): Tone =>
  s === "released" ? "success" : s === "held" ? "warning" : "danger";

export const INCOMING_QC: IncomingQc[] = [
  { id: "i1", number: "QC-IN-2608-21", date: "2026-08-08", supplier: "Himalaya Polymers", grn: "GRN-2608-14", item: "PBAT Resin", batch: "RM-PBAT-2607-04", qty: 2000, unit: "kg", sampleSize: 40, defects: 0, inspector: "R. Shrestha", result: "passed" },
  { id: "i2", number: "QC-IN-2608-22", date: "2026-08-09", supplier: "Nepal Starch Industries", grn: "GRN-2608-15", item: "Corn Starch Filler", batch: "RM-CS-2608-01", qty: 1500, unit: "kg", sampleSize: 30, defects: 4, inspector: "R. Shrestha", result: "failed" },
  { id: "i3", number: "QC-IN-2608-23", date: "2026-08-10", supplier: "GreenPack Traders", grn: "GRN-2608-16", item: "PLA Granules", batch: "RM-PLA-2608-02", qty: 900, unit: "kg", sampleSize: 20, defects: 1, inspector: "M. Karki", result: "rework" },
  { id: "i4", number: "QC-IN-2608-24", date: "2026-08-11", supplier: "Kathmandu Inks", grn: "GRN-2608-17", item: "Green Masterbatch", batch: "RM-MB-2608-05", qty: 120, unit: "kg", sampleSize: 10, defects: 0, inspector: "M. Karki", result: "pending" },
];

export const INPROCESS_QC: InProcessQc[] = [
  { id: "n1", number: "QC-IP-2608-40", date: "2026-08-08", order: "PRD-2608-011", product: "Compostable Carry Bag 12x16", stage: "Extrusion", parameter: "Film thickness", spec: "22 ± 2 µm", observed: "22.4 µm", inspector: "B. Tamang", result: "passed" },
  { id: "n2", number: "QC-IP-2608-41", date: "2026-08-08", order: "PRD-2608-011", product: "Compostable Carry Bag 12x16", stage: "Extrusion", parameter: "Tensile strength (MD)", spec: "≥ 18 MPa", observed: "19.6 MPa", inspector: "B. Tamang", result: "passed" },
  { id: "n3", number: "QC-IP-2608-42", date: "2026-08-09", order: "PRD-2608-011", product: "Compostable Carry Bag 12x16", stage: "Sealing", parameter: "Seal strength", spec: "≥ 12 N/15mm", observed: "10.8 N/15mm", inspector: "S. Magar", result: "failed" },
  { id: "n4", number: "QC-IP-2608-43", date: "2026-08-05", order: "PRD-2608-010", product: "Compostable Garbage Bag 24x32", stage: "Extrusion", parameter: "Film thickness", spec: "35 ± 3 µm", observed: "36.1 µm", inspector: "S. Magar", result: "passed" },
  { id: "n5", number: "QC-IP-2608-44", date: "2026-08-06", order: "PRD-2608-010", product: "Compostable Garbage Bag 24x32", stage: "Printing", parameter: "Print adhesion", spec: "No peel", observed: "Minor peel", inspector: "P. Gurung", result: "rework" },
];

export const FINISHED_QC: FinishedQc[] = [
  { id: "g1", number: "QC-FG-2608-12", date: "2026-08-10", batch: "FG-CB-2608-31", product: "Compostable Carry Bag 12x16", qty: 18400, unit: "pcs", disintegration: "91% @ 12 wk", biodegradation: "93% @ 180 d", heavyMetals: "Within limits", certRef: "ISO 17088 / NS-EN 13432", inspector: "R. Shrestha", result: "pending" },
  { id: "g2", number: "QC-FG-2608-11", date: "2026-08-07", batch: "FG-GB-2608-30", product: "Compostable Garbage Bag 24x32", qty: 8000, unit: "pcs", disintegration: "88% @ 12 wk", biodegradation: "91% @ 180 d", heavyMetals: "Within limits", certRef: "ISO 17088", inspector: "R. Shrestha", result: "passed" },
  { id: "g3", number: "QC-FG-2608-10", date: "2026-08-03", batch: "FG-CB-2608-29", product: "Compostable Carry Bag 12x16", qty: 15000, unit: "pcs", disintegration: "94% @ 12 wk", biodegradation: "95% @ 180 d", heavyMetals: "Within limits", certRef: "ISO 17088 / NS-EN 13432", inspector: "M. Karki", result: "passed" },
  { id: "g4", number: "QC-FG-2607-09", date: "2026-07-27", batch: "FG-FW-2607-22", product: "Food Wrap Sheet 10x10", qty: 9500, unit: "pcs", disintegration: "82% @ 12 wk", biodegradation: "86% @ 180 d", heavyMetals: "Cd marginal", certRef: "ISO 17088", inspector: "M. Karki", result: "failed" },
];

export const QUARANTINE: QuarantineItem[] = [
  { id: "q1", batch: "RM-CS-2608-01", item: "Corn Starch Filler", type: "Raw Material", qty: 1500, unit: "kg", bin: "QC-HOLD-01", reason: "Moisture above spec (14.2%)", heldOn: "2026-08-09", status: "held" },
  { id: "q2", batch: "FG-CB-2608-31", item: "Compostable Carry Bag 12x16", type: "Finished Goods", qty: 18400, unit: "pcs", bin: "QC-HOLD-03", reason: "Awaiting FG compostability report", heldOn: "2026-08-10", status: "held" },
  { id: "q3", batch: "FG-FW-2607-22", item: "Food Wrap Sheet 10x10", type: "Finished Goods", qty: 9500, unit: "pcs", bin: "QC-HOLD-02", reason: "Cadmium marginal — ISO 17088 fail", heldOn: "2026-07-27", status: "rejected" },
  { id: "q4", batch: "FG-GB-2608-30", item: "Compostable Garbage Bag 24x32", type: "Finished Goods", qty: 8000, unit: "pcs", bin: "FG-A-04", reason: "Routine FG hold", heldOn: "2026-08-06", status: "released" },
  { id: "q5", batch: "SFG-FILM-2607-07", item: "Extruded Film Roll", type: "Semi-finished", qty: 340, unit: "kg", bin: "QC-HOLD-02", reason: "Seal strength below spec", heldOn: "2026-08-09", status: "scrapped" },
];