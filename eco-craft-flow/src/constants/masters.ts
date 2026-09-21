/** Configuration masters that are not transactional records. */

export const TAX_RATES = [
  { id: "t-1", name: "VAT 13%", rate: 13, applies: "Sales & Purchase" },
  { id: "t-2", name: "VAT Exempt", rate: 0, applies: "Exports" },
  { id: "t-3", name: "TDS 1.5%", rate: 1.5, applies: "Service bills" },
];

export const UNITS = [
  { id: "un-1", name: "Kilogram", code: "KG" },
  { id: "un-2", name: "Piece", code: "PCS" },
  { id: "un-3", name: "Roll", code: "ROLL" },
  { id: "un-4", name: "Carton", code: "CTN" },
  { id: "un-5", name: "Metre", code: "MTR" },
];

export const CATEGORIES = [
  { id: "c-1", name: "Raw Material" },
  { id: "c-2", name: "Semi-Finished" },
  { id: "c-3", name: "Finished Goods" },
  { id: "c-4", name: "Packaging" },
];

export const LEAD_STAGES = [
  { id: "new", label: "New", tone: "neutral" as const },
  { id: "qualification", label: "Qualification", tone: "info" as const },
  { id: "proposal", label: "Proposal", tone: "warning" as const },
  { id: "negotiation", label: "Negotiation", tone: "warning" as const },
  { id: "won", label: "Won", tone: "success" as const },
  { id: "lost", label: "Lost", tone: "danger" as const },
];