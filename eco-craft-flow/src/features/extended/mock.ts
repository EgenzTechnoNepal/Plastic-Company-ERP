/** Demo data for the modules added from the Egenz ERP proposal (Sections 6.x). */

export interface SalesReturn {
  id: string;
  number: string;
  customer: string;
  invoice: string;
  date: string;
  item: string;
  batch: string;
  qty: number;
  reason: "damaged" | "wrong_item" | "quality_issue" | "excess_supply" | "expired";
  disposition: "restock" | "quarantine" | "scrap";
  creditAmount: number;
  status: "requested" | "inspected" | "credited";
}

export const SALES_RETURNS: SalesReturn[] = [
  { id: "sr-1", number: "SR-2081-004", customer: "Everest Mart", invoice: "INV-2081-029", date: "2081-05-02", item: "Compostable Carry Bag 12x16", batch: "FG-2081-B11", qty: 480, reason: "damaged", disposition: "scrap", creditAmount: 28800, status: "credited" },
  { id: "sr-2", number: "SR-2081-005", customer: "Pokhara Traders", invoice: "INV-2081-031", date: "2081-05-06", item: "Compostable Liner Roll", batch: "FG-2081-B12", qty: 120, reason: "quality_issue", disposition: "quarantine", creditAmount: 15600, status: "inspected" },
  { id: "sr-3", number: "SR-2081-006", customer: "Himalayan Retail", invoice: "INV-2081-034", date: "2081-05-09", item: "Compostable Carry Bag 10x14", batch: "FG-2081-B14", qty: 900, reason: "excess_supply", disposition: "restock", creditAmount: 40500, status: "requested" },
  { id: "sr-4", number: "SR-2081-007", customer: "Biratnagar Superstore", invoice: "INV-2081-036", date: "2081-05-11", item: "Compostable Garbage Bag L", batch: "FG-2081-B15", qty: 250, reason: "wrong_item", disposition: "restock", creditAmount: 18750, status: "inspected" },
];

export interface Dealer {
  id: string;
  code: string;
  name: string;
  kind: "dealer" | "agent" | "distributor";
  territory: string;
  phone: string;
  commission: number;
  target: number;
  achieved: number;
  consignmentValue: number;
}

export const DEALERS: Dealer[] = [
  { id: "d-1", code: "DL-001", name: "Koshi Distribution House", kind: "distributor", territory: "Koshi Province", phone: "+977-9801122334", commission: 6, target: 1800000, achieved: 1542000, consignmentValue: 385000 },
  { id: "d-2", code: "DL-002", name: "Madhesh Agencies", kind: "dealer", territory: "Madhesh Province", phone: "+977-9812233445", commission: 5, target: 1200000, achieved: 1310000, consignmentValue: 210000 },
  { id: "d-3", code: "AG-001", name: "Sunil Adhikari", kind: "agent", territory: "Kathmandu Valley", phone: "+977-9843344556", commission: 3.5, target: 900000, achieved: 640000, consignmentValue: 0 },
  { id: "d-4", code: "DL-003", name: "Gandaki Eco Supplies", kind: "dealer", territory: "Gandaki Province", phone: "+977-9856677889", commission: 5, target: 1000000, achieved: 880000, consignmentValue: 148000 },
];

export interface PurchaseReturn {
  id: string;
  number: string;
  supplier: string;
  grn: string;
  date: string;
  item: string;
  batch: string;
  qty: number;
  uom: string;
  reason: "quality_reject" | "short_supply" | "wrong_item" | "damaged_in_transit";
  debitAmount: number;
  status: "draft" | "sent" | "settled";
}

export const PURCHASE_RETURNS: PurchaseReturn[] = [
  { id: "pr-1", number: "PRT-2081-003", supplier: "Kathmandu Polymers", grn: "GRN-2081-028", date: "2081-05-03", item: "PLA Resin", batch: "RM-2081-114", qty: 300, uom: "kg", reason: "quality_reject", debitAmount: 96000, status: "settled" },
  { id: "pr-2", number: "PRT-2081-004", supplier: "Biopolymer Nepal", grn: "GRN-2081-030", date: "2081-05-07", item: "PBAT Granule", batch: "RM-2081-118", qty: 150, uom: "kg", reason: "damaged_in_transit", debitAmount: 54000, status: "sent" },
  { id: "pr-3", number: "PRT-2081-005", supplier: "Terai Packaging", grn: "GRN-2081-033", date: "2081-05-10", item: "Printed Carton", batch: "PK-2081-021", qty: 400, uom: "pcs", reason: "wrong_item", debitAmount: 22000, status: "draft" },
];

export interface OcrBill {
  id: string;
  file: string;
  supplier: string;
  billNumber: string;
  billDate: string;
  amount: number;
  vat: number;
  confidence: number;
  source: "scanner" | "mobile_camera" | "email_inbox" | "upload";
  status: "queued" | "extracted" | "review" | "posted" | "failed";
  matchedPo?: string;
}

export const OCR_BILLS: OcrBill[] = [
  { id: "ob-1", file: "kathmandu-polymers-4821.pdf", supplier: "Kathmandu Polymers", billNumber: "4821", billDate: "2081-05-04", amount: 486000, vat: 63180, confidence: 97, source: "email_inbox", status: "posted", matchedPo: "PO-2081-021" },
  { id: "ob-2", file: "biopolymer-2210.jpg", supplier: "Biopolymer Nepal", billNumber: "2210", billDate: "2081-05-08", amount: 312500, vat: 40625, confidence: 91, source: "mobile_camera", status: "review", matchedPo: "PO-2081-026" },
  { id: "ob-3", file: "terai-packaging-1180.pdf", supplier: "Terai Packaging", billNumber: "1180", billDate: "2081-05-09", amount: 128400, vat: 16692, confidence: 88, source: "scanner", status: "extracted" },
  { id: "ob-4", file: "nepal-logistics-773.jpg", supplier: "Nepal Logistics", billNumber: "773", billDate: "2081-05-10", amount: 45200, vat: 5876, confidence: 64, source: "mobile_camera", status: "failed" },
  { id: "ob-5", file: "himal-chem-9022.pdf", supplier: "Himal Chemicals", billNumber: "9022", billDate: "2081-05-12", amount: 96800, vat: 12584, confidence: 0, source: "upload", status: "queued" },
];

export interface MrpSuggestion {
  id: string;
  item: string;
  type: "purchase_requisition" | "work_order";
  grossRequirement: number;
  freeStock: number;
  onOrder: number;
  netRequirement: number;
  uom: string;
  leadDays: number;
  needBy: string;
  status: "planned" | "firmed" | "converted";
}

export const MRP_SUGGESTIONS: MrpSuggestion[] = [
  { id: "mrp-1", item: "PLA Resin", type: "purchase_requisition", grossRequirement: 4200, freeStock: 420, onOrder: 1000, netRequirement: 2780, uom: "kg", leadDays: 21, needBy: "2081-06-02", status: "planned" },
  { id: "mrp-2", item: "PBAT Granule", type: "purchase_requisition", grossRequirement: 2600, freeStock: 940, onOrder: 0, netRequirement: 1660, uom: "kg", leadDays: 18, needBy: "2081-05-28", status: "firmed" },
  { id: "mrp-3", item: "Masterbatch Green", type: "purchase_requisition", grossRequirement: 320, freeStock: 190, onOrder: 60, netRequirement: 70, uom: "kg", leadDays: 12, needBy: "2081-05-24", status: "converted" },
  { id: "mrp-4", item: "Compostable Film (SFG)", type: "work_order", grossRequirement: 8000, freeStock: 1200, onOrder: 0, netRequirement: 6800, uom: "kg", leadDays: 4, needBy: "2081-05-22", status: "planned" },
  { id: "mrp-5", item: "Printed Carton", type: "purchase_requisition", grossRequirement: 5000, freeStock: 2400, onOrder: 1500, netRequirement: 1100, uom: "pcs", leadDays: 9, needBy: "2081-05-26", status: "planned" },
];

export interface MachineSlot {
  id: string;
  machine: string;
  order: string;
  product: string;
  date: string;
  shift: "morning" | "evening" | "night";
  setupMins: number;
  runMins: number;
  operator: string;
  status: "planned" | "running" | "completed" | "maintenance";
  utilisation: number;
}

export const MACHINE_SLOTS: MachineSlot[] = [
  { id: "ms-1", machine: "Blown Film Line A", order: "PRD-2081-019", product: "Compostable Film 25µ", date: "2081-05-14", shift: "morning", setupMins: 45, runMins: 380, operator: "Ram Bahadur", status: "running", utilisation: 88 },
  { id: "ms-2", machine: "Blown Film Line A", order: "PRD-2081-020", product: "Compostable Film 40µ", date: "2081-05-14", shift: "evening", setupMins: 60, runMins: 360, operator: "Kiran Tamang", status: "planned", utilisation: 84 },
  { id: "ms-3", machine: "Bag Making M-1", order: "PRD-2081-018", product: "Carry Bag 12x16", date: "2081-05-14", shift: "morning", setupMins: 30, runMins: 400, operator: "Sunita Magar", status: "completed", utilisation: 92 },
  { id: "ms-4", machine: "Bag Making M-2", order: "PRD-2081-021", product: "Garbage Bag L", date: "2081-05-15", shift: "night", setupMins: 35, runMins: 340, operator: "Dipesh Rai", status: "planned", utilisation: 76 },
  { id: "ms-5", machine: "Extruder E-1", order: "—", product: "Preventive maintenance", date: "2081-05-15", shift: "morning", setupMins: 0, runMins: 240, operator: "Maintenance team", status: "maintenance", utilisation: 0 },
];

export interface Ncr {
  id: string;
  number: string;
  source: "inspection" | "production" | "customer_complaint" | "audit";
  date: string;
  item: string;
  batch: string;
  severity: "minor" | "major" | "critical";
  disposition: "use_as_is" | "rework" | "regrade" | "reject" | "return_to_vendor";
  cost: number;
  status: "open" | "in_review" | "closed";
  capa?: string;
}

export const NCRS: Ncr[] = [
  { id: "ncr-1", number: "NCR-2081-011", source: "inspection", date: "2081-05-05", item: "PLA Resin", batch: "RM-2081-114", severity: "major", disposition: "return_to_vendor", cost: 96000, status: "closed", capa: "CAPA-2081-006" },
  { id: "ncr-2", number: "NCR-2081-012", source: "production", date: "2081-05-08", item: "Compostable Film 25µ", batch: "SFG-2081-B07", severity: "minor", disposition: "rework", cost: 12400, status: "in_review" },
  { id: "ncr-3", number: "NCR-2081-013", source: "inspection", date: "2081-05-10", item: "Carry Bag 10x14", batch: "FG-2081-B14", severity: "critical", disposition: "reject", cost: 184000, status: "open", capa: "CAPA-2081-008" },
  { id: "ncr-4", number: "NCR-2081-014", source: "customer_complaint", date: "2081-05-11", item: "Liner Roll", batch: "FG-2081-B12", severity: "major", disposition: "regrade", cost: 32000, status: "open" },
];

export interface Capa {
  id: string;
  number: string;
  ncr?: string;
  owner: string;
  openedOn: string;
  dueOn: string;
  stage: "containment" | "root_cause" | "corrective" | "preventive" | "verification" | "closed";
  problem: string;
  effectiveness: "pending" | "effective" | "not_effective";
}

export const CAPAS: Capa[] = [
  { id: "capa-1", number: "CAPA-2081-006", ncr: "NCR-2081-011", owner: "Bina Thapa", openedOn: "2081-05-05", dueOn: "2081-05-20", stage: "closed", problem: "Incoming PLA resin moisture above specification", effectiveness: "effective" },
  { id: "capa-2", number: "CAPA-2081-007", owner: "Rajesh Sharma", openedOn: "2081-05-07", dueOn: "2081-05-25", stage: "corrective", problem: "Repeated film thickness variation on Line A", effectiveness: "pending" },
  { id: "capa-3", number: "CAPA-2081-008", ncr: "NCR-2081-013", owner: "Bina Thapa", openedOn: "2081-05-10", dueOn: "2081-05-30", stage: "root_cause", problem: "Disintegration test failure on FG batch B14", effectiveness: "pending" },
  { id: "capa-4", number: "CAPA-2081-009", owner: "Hari Karki", openedOn: "2081-05-12", dueOn: "2081-06-02", stage: "containment", problem: "Quarantine bin overflow causing mixed-batch risk", effectiveness: "pending" },
];

export interface PayrollLine {
  id: string;
  employee: string;
  code: string;
  department: string;
  basic: number;
  overtime: number;
  incentive: number;
  ssf: number;
  tax: number;
  advance: number;
  status: "draft" | "approved" | "paid";
}

export const PAYROLL_LINES: PayrollLine[] = [
  { id: "pl-1", employee: "Ram Bahadur Thapa", code: "EMP-001", department: "Production", basic: 32000, overtime: 4200, incentive: 2500, ssf: 3520, tax: 900, advance: 0, status: "paid" },
  { id: "pl-2", employee: "Sunita Magar", code: "EMP-004", department: "Production", basic: 28000, overtime: 3100, incentive: 2100, ssf: 3080, tax: 700, advance: 2000, status: "paid" },
  { id: "pl-3", employee: "Bina Thapa", code: "EMP-009", department: "Quality", basic: 45000, overtime: 0, incentive: 0, ssf: 4950, tax: 2200, advance: 0, status: "approved" },
  { id: "pl-4", employee: "Hari Karki", code: "EMP-012", department: "Warehouse", basic: 34000, overtime: 1800, incentive: 0, ssf: 3740, tax: 1100, advance: 5000, status: "approved" },
  { id: "pl-5", employee: "Sita Rai", code: "EMP-015", department: "Sales", basic: 38000, overtime: 0, incentive: 6400, ssf: 4180, tax: 1600, advance: 0, status: "draft" },
  { id: "pl-6", employee: "Nabin Gurung", code: "EMP-018", department: "Accounts", basic: 36000, overtime: 0, incentive: 0, ssf: 3960, tax: 1300, advance: 0, status: "draft" },
];

export const netPay = (l: PayrollLine) =>
  l.basic + l.overtime + l.incentive - l.ssf - l.tax - l.advance;

export interface AuditEntry {
  id: string;
  time: string;
  user: string;
  role: string;
  action: "create" | "update" | "delete" | "approve" | "login" | "export";
  module: string;
  record: string;
  ip: string;
}

export const AUDIT_LOG: AuditEntry[] = [
  { id: "al-1", time: "2081-05-14 09:12", user: "Rajesh Sharma", role: "Manager", action: "approve", module: "Sales", record: "SO-2081-047", ip: "10.0.4.21" },
  { id: "al-2", time: "2081-05-14 09:04", user: "Hari Karki", role: "Warehouse", action: "create", module: "Warehouse", record: "GRN-2081-032", ip: "10.0.4.44" },
  { id: "al-3", time: "2081-05-14 08:58", user: "Bina Thapa", role: "Quality Control", action: "update", module: "Quality", record: "QC-2081-058", ip: "10.0.4.19" },
  { id: "al-4", time: "2081-05-14 08:31", user: "Sita Rai", role: "Sales", action: "export", module: "Reports", record: "Sales register (CSV)", ip: "10.0.4.33" },
  { id: "al-5", time: "2081-05-14 08:02", user: "Admin", role: "Administrator", action: "login", module: "Security", record: "Session started", ip: "10.0.4.2" },
  { id: "al-6", time: "2081-05-13 17:45", user: "Nabin Gurung", role: "Purchase", action: "delete", module: "Purchase", record: "Draft PO-2081-027", ip: "10.0.4.27" },
];