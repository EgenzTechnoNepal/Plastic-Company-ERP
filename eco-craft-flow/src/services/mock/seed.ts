import type { ErpRecord, LineItem, DocStatus } from "@/types/erp";
import { applyBulkSeed } from "./seed-bulk";

let n = 0;
const uid = (p = "r") => `${p}-${(++n).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function makeLine(p: Partial<LineItem>): LineItem {
  return {
    id: uid("ln"),
    item: p.item ?? "",
    description: p.description,
    uom: p.uom ?? "PCS",
    warehouse: p.warehouse,
    batch: p.batch,
    serial: p.serial,
    qty: p.qty ?? 0,
    rate: p.rate ?? 0,
    discountPct: p.discountPct ?? 0,
    taxPct: p.taxPct ?? 13,
    debit: p.debit,
    credit: p.credit,
    account: p.account,
    costCentre: p.costCentre,
  };
}

export function rec(
  entity: string,
  code: string,
  title: string,
  date: string,
  status: DocStatus,
  fields: Record<string, unknown> = {},
  lines: LineItem[] = [],
  links: ErpRecord["links"] = [],
): ErpRecord {
  return {
    id: `${entity}:${code}`,
    entity,
    code,
    title,
    date,
    status,
    fields,
    lines,
    history: [{ id: uid("h"), status, by: "System (seed)", at: `${date}T09:00:00Z`, comment: "Seeded record" }],
    links,
    createdAt: `${date}T09:00:00Z`,
    updatedAt: `${date}T09:00:00Z`,
  };
}

const FG = [
  { code: "FG-CORN-001", name: "Cornstarch Carry Bag 12x16", uom: "PCS", rate: 14 },
  { code: "FG-CORN-002", name: "Cornstarch Carry Bag 16x20", uom: "PCS", rate: 19 },
  { code: "FG-GRB-010", name: "Compostable Garbage Bag 24x32", uom: "PCS", rate: 26 },
  { code: "FG-FILM-004", name: "Biodegradable Wrap Film 300mm", uom: "ROLL", rate: 480 },
];
const RM = [
  { code: "RM-PLA-001", name: "PLA Resin (Corn Based)", uom: "KG", rate: 320 },
  { code: "RM-PBAT-002", name: "PBAT Polymer", uom: "KG", rate: 410 },
  { code: "RM-STA-003", name: "Modified Corn Starch", uom: "KG", rate: 145 },
  { code: "RM-MB-004", name: "Green Masterbatch", uom: "KG", rate: 620 },
];

export const CATALOG = { FG, RM };

export function buildSeed(): Record<string, ErpRecord[]> {
  const db: Record<string, ErpRecord[]> = {};
  const push = (e: string, r: ErpRecord) => {
    (db[e] ||= []).push(r);
  };

  /* ---------------- Administration ---------------- */
  ["Head Office — Kathmandu", "Factory — Bhaktapur", "Depot — Pokhara"].forEach((b, i) =>
    push("branches", rec("branches", `BR-00${i + 1}`, b, "2026-01-01", "active", {
      address: b.split("— ")[1], manager: ["Rajesh Sharma", "Bikash Thapa", "Sunita Gurung"][i], pan: `60123456${i}`,
    })),
  );
  ["Sales", "Purchase", "Production", "Warehouse", "Quality", "Accounts", "HR"].forEach((d, i) =>
    push("departments", rec("departments", `DEP-00${i + 1}`, d, "2026-01-01", "active", { head: "Rajesh Sharma", headcount: 6 + i })),
  );
  [["Kathmandu Valley", "Sita Rai"], ["Western Region", "Prakash Adhikari"], ["Eastern Region", "Nabin Limbu"]].forEach(([t, o], i) =>
    push("territories", rec("territories", `TER-00${i + 1}`, t, "2026-01-01", "active", { owner: o, customers: 8 - i })),
  );

  /* ---------------- CRM ---------------- */
  const customers = [
    ["CUST-001", "Himalayan Organic Foods", "Kathmandu", 2500000, 845000],
    ["CUST-002", "Everest Retail Chain", "Lalitpur", 5000000, 312000],
    ["CUST-003", "GreenPack Nepal", "Bhaktapur", 1500000, 0],
    ["CUST-004", "Ministry of Environment", "Kathmandu", 10000000, 740000],
    ["CUST-005", "BioWrap Distributors Pvt. Ltd.", "Pokhara", 2000000, 0],
  ] as const;
  customers.forEach(([code, name, city, limit, outstanding]) =>
    push("customers", rec("customers", code, name, "2026-01-12", "active", {
      contactPerson: "Procurement Head", phone: "+977-98510" + code.slice(-3), email: `info@${code.toLowerCase()}.com.np`,
      city, pan: "3021" + code.slice(-3) + "45", creditLimit: limit, creditDays: 30, outstanding,
      territory: "Kathmandu Valley", priceList: "Standard", type: "Corporate",
      ytdSales: [2100000, 1620000, 890000, 4200000, 3200000][Number(code.slice(-1)) - 1] ?? 500000,
    })),
  );
  [["CON-001", "Anita Shrestha", "CUST-001", "Procurement Manager"], ["CON-002", "Deepak Joshi", "CUST-002", "Category Head"],
   ["CON-003", "Rita Lama", "CUST-004", "Section Officer"]].forEach(([c, nm, cu, role]) =>
    push("contacts", rec("contacts", c, nm, "2026-02-02", "active", { customer: cu, designation: role, phone: "+977-9841000000", email: "contact@ecowrap.com" })),
  );
  const leadStages = ["new", "qualification", "proposal", "negotiation", "won", "lost"];
  ["Sagarmatha Supermart", "Pathibhara Traders", "Nepal Airlines Catering", "Bhatbhateni Superstore", "Organic Valley Farms", "Mustang Coffee Co."]
    .forEach((nm, i) =>
      push("leads", rec("leads", `LEAD-0${10 + i}`, nm, `2026-06-${10 + i}`, "open", {
        stage: leadStages[i], source: ["Website", "Referral", "Trade Fair", "Cold Call", "Website", "Referral"][i],
        owner: "Sita Rai", expectedValue: 150000 * (i + 2), probability: [10, 30, 55, 75, 100, 0][i],
        expectedClose: `2026-09-${10 + i}`, phone: "+977-9801234" + i, city: "Kathmandu", lostReason: i === 5 ? "Price" : "",
      })),
    );
  push("opportunities", rec("opportunities", "OPP-001", "Bhatbhateni annual carry-bag contract", "2026-06-20", "open", {
    customer: "Bhatbhateni Superstore", stage: "negotiation", value: 4200000, probability: 70, owner: "Sita Rai", expectedClose: "2026-09-15",
  }));
  push("activities", rec("activities", "ACT-001", "Follow-up call — Himalayan Organic", "2026-07-18", "completed", {
    type: "Call", customer: "CUST-001", owner: "Sita Rai", outcome: "Requested revised quotation", nextAction: "Send Rev 02", nextDate: "2026-07-21", dueDate: "2026-07-21",
  }));
  push("activities", rec("activities", "ACT-002", "Overdue visit — Himalayan Organic", "2026-08-10", "open", {
    type: "Visit", customer: "CUST-001", owner: "Sita Rai", nextAction: "Collect payment plan", nextDate: "2026-08-12", dueDate: "2026-08-12",
  }));
  push("tickets", rec("tickets", "TKT-001", "Print defect on cornstarch bags", "2026-08-20", "open", {
    name: "Print defect on cornstarch bags", customer: "CUST-001", priority: "high", slaHours: 24,
    openedAt: "2026-08-20T08:00:00Z", dueAt: "2026-08-21T08:00:00Z", assignee: "Sita Rai",
    complaint: "Batch BATCH-001 bags have faded print. Customer requesting replacement.",
  }));
  push("tickets", rec("tickets", "TKT-002", "Delivery timing query", "2026-08-22", "in_progress", {
    name: "Delivery timing query", customer: "CUST-002", priority: "normal", slaHours: 48,
    openedAt: "2026-08-22T04:00:00Z", dueAt: "2026-08-24T04:00:00Z", assignee: "Prakash Adhikari",
    complaint: "Asked for revised delivery window on the next garbage-bag drop.",
  }));
  [["DLR-001", "Pokhara Agro Agencies", "Western Region", 5, 5000000, 3200000, 180000], ["DLR-002", "Biratnagar Poly Traders", "Eastern Region", 4, 4000000, 2100000, 95000]]
    .forEach(([c, nm, t, comm, target, achievement, consignment]) =>
      push("dealers", rec("dealers", c as string, nm as string, "2026-02-10", "active", {
        territory: t, commissionPct: comm, ytdSales: achievement, commissionEarned: 160000, contact: "+977-9856000000",
        target, achievement, consignmentStock: consignment,
      })),
    );

  /* ---------------- Quotation -> SO -> Dispatch -> Invoice -> Payment ---------------- */
  const qtLines = [
    makeLine({ item: FG[0].code, description: FG[0].name, uom: "PCS", qty: 20000, rate: 14, discountPct: 5, warehouse: "WH-FG" }),
    makeLine({ item: FG[2].code, description: FG[2].name, uom: "PCS", qty: 5000, rate: 26, discountPct: 0, warehouse: "WH-FG" }),
  ];
  push("quotations", rec("quotations", "QT-001", "Himalayan Organic Foods — Rev 02", "2026-07-05", "approved", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", revision: "Rev 02", validTill: "2026-08-05",
    paymentTerms: "30 Days Credit", currency: "NPR", salesperson: "Sita Rai", dispatchStatus: "Accepted",
    sentAt: "2026-07-06", openedAt: "2026-07-06", acceptedAt: "2026-07-08", channel: "Email",
  }, qtLines, [{ entity: "customers", id: "customers:CUST-001", label: "CUST-001" }, { entity: "sales_orders", id: "sales_orders:SO-001", label: "SO-001" }]));
  push("quotations", rec("quotations", "QT-002", "Everest Retail Chain — Rev 01", "2026-07-14", "pending_approval", {
    customer: "CUST-002", customerName: "Everest Retail Chain", revision: "Rev 01", validTill: "2026-08-14",
    paymentTerms: "45 Days Credit", currency: "NPR", salesperson: "Sita Rai", dispatchStatus: "Draft",
  }, [makeLine({ item: FG[1].code, description: FG[1].name, qty: 30000, rate: 19, discountPct: 12, warehouse: "WH-FG" })]));

  push("sales_orders", rec("sales_orders", "SO-001", "Himalayan Organic Foods", "2026-07-09", "approved", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", quotation: "QT-001", branch: "Head Office — Kathmandu",
    paymentTerms: "30 Days Credit", currency: "NPR", deliveryDate: "2026-07-25", salesperson: "Sita Rai",
    allocationStatus: "Allocated", pickStatus: "Picked", packStatus: "Packed", dispatchStatus: "Dispatched",
    invoiceStatus: "Invoiced", paymentStatus: "Partially Paid",
  }, qtLines.map((l) => makeLine({ ...l, id: undefined as never })), [
    { entity: "quotations", id: "quotations:QT-001", label: "QT-001" },
    { entity: "deliveries", id: "deliveries:DN-001", label: "DN-001" },
    { entity: "invoices", id: "invoices:INV-001", label: "INV-001" },
  ]));
  push("sales_orders", rec("sales_orders", "SO-002", "Ministry of Environment", "2026-07-14", "in_progress", {
    customer: "CUST-004", customerName: "Ministry of Environment", branch: "Head Office — Kathmandu",
    paymentTerms: "45 Days Credit", currency: "NPR", deliveryDate: "2026-07-28", salesperson: "Prakash Adhikari",
    allocationStatus: "Partially Allocated", dispatchStatus: "Pending", invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[3].code, description: FG[3].name, uom: "ROLL", qty: 2000, rate: 480, warehouse: "WH-FG" })]));
  push("sales_orders", rec("sales_orders", "SO-003", "GreenPack Nepal", "2026-08-18", "in_progress", {
    customer: "CUST-003", customerName: "GreenPack Nepal", branch: "Head Office — Kathmandu",
    paymentTerms: "30 Days Credit", currency: "NPR", deliveryDate: "2026-08-28", salesperson: "Sita Rai",
    allocationStatus: "Allocated", pickStatus: "Pending", dispatchStatus: "Pending", invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[1].code, description: FG[1].name, qty: 5000, rate: 19, warehouse: "WH-FG" })]));
  push("sales_orders", rec("sales_orders", "SO-004", "BioWrap Distributors Pvt. Ltd.", "2026-08-19", "in_progress", {
    customer: "CUST-005", customerName: "BioWrap Distributors Pvt. Ltd.", branch: "Depot — Pokhara",
    paymentTerms: "30 Days Credit", currency: "NPR", deliveryDate: "2026-08-27", salesperson: "Prakash Adhikari",
    allocationStatus: "Allocated", pickStatus: "Picked", packStatus: "Pending", dispatchStatus: "Pending", invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[2].code, description: FG[2].name, qty: 2000, rate: 26, warehouse: "WH-FG" })]));
  push("sales_orders", rec("sales_orders", "SO-005", "GreenPack Nepal — packed", "2026-08-20", "in_progress", {
    customer: "CUST-003", customerName: "GreenPack Nepal", branch: "Head Office — Kathmandu",
    paymentTerms: "15 Days Credit", currency: "NPR", deliveryDate: "2026-08-26", salesperson: "Sita Rai",
    allocationStatus: "Allocated", pickStatus: "Picked", packStatus: "Packed", dispatchStatus: "Pending", invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[0].code, description: FG[0].name, qty: 1000, rate: 14, warehouse: "WH-FG" })]));
  push("sales_orders", rec("sales_orders", "SO-006", "Warehouse pick — Himalayan Organic", "2026-08-21", "in_progress", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", branch: "Head Office — Kathmandu",
    paymentTerms: "30 Days Credit", currency: "NPR", deliveryDate: "2026-08-30", salesperson: "Sita Rai",
    allocationStatus: "Allocated", pickStatus: "Pending", dispatchStatus: "Pending", invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[1].code, description: FG[1].name, qty: 1500, rate: 19, warehouse: "WH-FG" })]));

  push("deliveries", rec("deliveries", "DN-001", "Delivery Challan — Himalayan Organic", "2026-07-22", "completed", {
    salesOrder: "SO-001", customerName: "Himalayan Organic Foods", vehicle: "BA 2 KHA 4412", driver: "Ram Bahadur",
    gatePass: "GP-0091", destination: "Balaju, Kathmandu", packedBy: "Hari Karki",
  }, qtLines.map((l) => makeLine({ ...l, id: undefined as never })), [{ entity: "sales_orders", id: "sales_orders:SO-001", label: "SO-001" }]));

  push("invoices", rec("invoices", "INV-001", "Himalayan Organic Foods", "2026-07-22", "posted", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", salesOrder: "SO-001", delivery: "DN-001",
    dueDate: "2026-08-21", paid: 200000, fiscalYear: "2082/83", irdStatus: "Transmitted", buyerPan: "302100145",
  }, qtLines.map((l) => makeLine({ ...l, id: undefined as never })), [
    { entity: "sales_orders", id: "sales_orders:SO-001", label: "SO-001" },
    { entity: "payments", id: "payments:PAY-001", label: "PAY-001" },
    { entity: "vouchers", id: "vouchers:JV-001", label: "JV-001" },
  ]));
  push("invoices", rec("invoices", "INV-002", "Annapurna Foods Ltd.", "2026-06-15", "posted", {
    customer: "CUST-003", customerName: "Annapurna Foods Ltd.", dueDate: "2026-07-15", paid: 0,
    fiscalYear: "2082/83", irdStatus: "Transmitted", buyerPan: "302100987",
  }, [makeLine({ item: FG[0].code, description: FG[0].name, qty: 25000, rate: 14 })]));

  push("payments", rec("payments", "PAY-001", "Receipt — Himalayan Organic Foods", "2026-07-24", "posted", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", mode: "Bank Transfer", bank: "NIC Asia",
    reference: "NIC-TXN-88291", amount: 200000, allocatedTo: "INV-001",
  }, [], [{ entity: "invoices", id: "invoices:INV-001", label: "INV-001" }]));

  push("sales_returns", rec("sales_returns", "SR-001", "Return — Himalayan Organic Foods", "2026-07-28", "submitted", {
    customer: "CUST-001", customerName: "Himalayan Organic Foods", originalInvoice: "INV-001", reason: "Print defect on batch",
    authorisedBy: "Rajesh Sharma", inspection: "Pending", disposition: "Quarantine", quarantineRef: "QAR-001", creditNote: "",
  }, [makeLine({ item: FG[0].code, description: FG[0].name, qty: 500, rate: 14, batch: "BATCH-001" })],
    [{ entity: "invoices", id: "invoices:INV-001", label: "INV-001" }]));

  /* ---------------- Purchase chain ---------------- */
  [["SUP-001", "Nepal Polymer Imports", "PLA/PBAT Resin", 4.6], ["SUP-002", "Kathmandu Starch Mills", "Corn Starch", 4.2],
   ["SUP-003", "Asia Masterbatch Co.", "Additives", 3.8]].forEach(([c, nm, cat, rating]) =>
    push("suppliers", rec("suppliers", c as string, nm as string, "2026-01-20", "active", {
      category: cat, rating, phone: "+977-9801112223", email: "sales@vendor.com.np", pan: "60199" + (c as string).slice(-3),
      paymentTerms: "30 Days", outstanding: 435000, qualityScore: 92, onTimeDelivery: 88,
    })),
  );
  push("purchase_requisitions", rec("purchase_requisitions", "PR-001", "PLA resin replenishment", "2026-07-02", "approved", {
    department: "Production", requestedBy: "Bikash Thapa", requiredBy: "2026-07-20", justification: "Below reorder level", priority: "High",
    rfq: "RFQ-001",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 5000, rate: 320 })],
    [{ entity: "rfqs", id: "rfqs:RFQ-001", label: "RFQ-001" }]));
  push("purchase_requisitions", rec("purchase_requisitions", "PR-002", "PBAT polymer reorder (alert)", "2026-08-18", "pending_approval", {
    department: "Warehouse", requestedBy: "Hari Karki", requiredBy: "2026-09-05", justification: "RM-PBAT-002 below reorder", priority: "High",
    source: "Reorder alert",
  }, [makeLine({ item: RM[1].code, description: RM[1].name, uom: "KG", qty: 1500, rate: 410 })]));
  push("rfqs", rec("rfqs", "RFQ-001", "RFQ — PLA Resin 5,000 KG", "2026-07-03", "completed", {
    requisition: "PR-001", vendors: "SUP-001, SUP-002, SUP-003", closingDate: "2026-07-06", selectedVendor: "SUP-001",
    selectedVendorName: "Nepal Polymer Imports", selectionJustification: "Best landed cost with acceptable lead time.",
    comparison: [
      { vendor: "SUP-001", vendorName: "Nepal Polymer Imports", rate: 320, leadDays: 7, paymentTerms: "30 Days", qualityRating: 4.6, total: 1772320 },
      { vendor: "SUP-002", vendorName: "Kathmandu Starch Mills", rate: 332, leadDays: 5, paymentTerms: "Advance", qualityRating: 4.2, total: 1875800 },
      { vendor: "SUP-003", vendorName: "Asia Masterbatch Co.", rate: 318, leadDays: 18, paymentTerms: "45 Days", qualityRating: 3.8, total: 1796700 },
    ],
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 5000, rate: 320 })],
    [{ entity: "purchase_orders", id: "purchase_orders:PO-001", label: "PO-001" }]));
  push("rfqs", rec("rfqs", "RFQ-002", "RFQ — Corn starch 8,000 KG", "2026-08-19", "in_progress", {
    requisition: "", vendors: "SUP-001, SUP-002, SUP-003", closingDate: "2026-08-25",
    quotes: [
      { vendor: "SUP-001", vendorName: "Nepal Polymer Imports", rate: 148, leadDays: 10, paymentTerms: "30 Days", qualityRating: 4.6, total: 1337920 },
      { vendor: "SUP-002", vendorName: "Kathmandu Starch Mills", rate: 145, leadDays: 6, paymentTerms: "30 Days", qualityRating: 4.2, total: 1310800 },
      { vendor: "SUP-003", vendorName: "Asia Masterbatch Co.", rate: 151, leadDays: 4, paymentTerms: "Advance", qualityRating: 3.8, total: 1365040 },
    ],
  }, [makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 8000, rate: 145 })]));
  push("purchase_orders", rec("purchase_orders", "PO-001", "Nepal Polymer Imports", "2026-07-07", "approved", {
    supplier: "SUP-001", supplierName: "Nepal Polymer Imports", requisition: "PR-001", rfq: "RFQ-001",
    paymentTerms: "30 Days", currency: "NPR", deliveryDate: "2026-07-15", receiptStatus: "Received", billStatus: "Billed",
    freight: 12000, duty: 0, clearing: 4500, amendment: "Rev 01",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 5000, rate: 320, discountPct: 2 })],
    [{ entity: "grns", id: "grns:GRN-001", label: "GRN-001" }, { entity: "purchase_bills", id: "purchase_bills:BILL-001", label: "BILL-001" }]));
  push("gate_entries", rec("gate_entries", "GE-001", "Gate Entry — Nepal Polymer", "2026-07-15", "completed", {
    purchaseOrder: "PO-001", vehicle: "BA 5 CHA 1188", driver: "Suresh Yadav", inTime: "08:40", securityBy: "Gate 1",
  }));
  push("grns", rec("grns", "GRN-001", "GRN — PLA Resin", "2026-07-15", "completed", {
    purchaseOrder: "PO-001", supplierName: "Nepal Polymer Imports", gateEntry: "GE-001", warehouse: "WH-RM",
    inspection: "Passed", batch: "RM-BATCH-0715", acceptedQty: 4950, rejectedQty: 50, putawayStatus: "Pending",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 5000, rate: 320, warehouse: "WH-RM", batch: "RM-BATCH-0715" })],
    [{ entity: "purchase_orders", id: "purchase_orders:PO-001", label: "PO-001" }, { entity: "qc_inspections", id: "qc_inspections:QC-001", label: "QC-001" }]));
  push("purchase_bills", rec("purchase_bills", "BILL-001", "Nepal Polymer Imports", "2026-07-16", "approved", {
    supplier: "SUP-001", supplierName: "Nepal Polymer Imports", purchaseOrder: "PO-001", grn: "GRN-001",
    dueDate: "2026-08-15", matchStatus: "3-Way Matched", vendorInvoiceNo: "NPI/26/1182", paid: 0,
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 4950, rate: 320, discountPct: 2 })],
    [{ entity: "vendor_payments", id: "vendor_payments:VP-001", label: "VP-001" }]));
  push("vendor_payments", rec("vendor_payments", "VP-001", "Payment — Nepal Polymer Imports", "2026-07-30", "posted", {
    supplier: "SUP-001", bill: "BILL-001", mode: "Bank Transfer", bank: "Nabil Bank", reference: "NBL-99213", amount: 800000,
  }));
  push("purchase_returns", rec("purchase_returns", "PRT-001", "Return to Nepal Polymer Imports", "2026-07-17", "submitted", {
    supplier: "SUP-001", grn: "GRN-001", reason: "Moisture above spec", inspection: "Failed", debitNote: "DBN-001",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 50, rate: 320, batch: "RM-BATCH-0715" })]));
  push("debit_notes", rec("debit_notes", "DBN-001", "Debit Note — Nepal Polymer Imports", "2026-07-18", "posted", {
    supplier: "SUP-001", purchaseReturn: "PRT-001", amount: 18080, reason: "Rejected quantity 50 KG",
  }));
  push("ocr_bills", rec("ocr_bills", "OCR-001", "Scanned bill — NPI/26/1182", "2026-07-16", "completed", {
    source: "PDF Upload", vendor: "Nepal Polymer Imports", invoiceNo: "NPI/26/1182", pan: "601990001",
    extractedTotal: 1789480, confidence: 0.94, matchStatus: "Matched", purchaseOrder: "PO-001", grn: "GRN-001",
  }));
  push("purchase_orders", rec("purchase_orders", "PO-002", "Kathmandu Starch Mills", "2026-08-20", "approved", {
    supplier: "SUP-002", supplierName: "Kathmandu Starch Mills", rfq: "RFQ-002",
    paymentTerms: "30 Days", currency: "NPR", deliveryDate: "2026-08-28", receiptStatus: "Pending", billStatus: "Not billed",
    freight: 8000, duty: 0, clearing: 2000, amendment: "Rev 01",
  }, [makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 8000, rate: 145 })]));
  push("purchase_orders", rec("purchase_orders", "PO-003", "Asia Masterbatch Co.", "2026-08-21", "in_progress", {
    supplier: "SUP-003", supplierName: "Asia Masterbatch Co.", paymentTerms: "15 Days", currency: "NPR",
    deliveryDate: "2026-08-26", receiptStatus: "At gate", billStatus: "Not billed", amendment: "Rev 01",
  }, [makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 400, rate: 620 })]));
  push("gate_entries", rec("gate_entries", "GE-002", "Gate Entry — Asia Masterbatch", "2026-08-22", "completed", {
    purchaseOrder: "PO-003", vehicle: "BA 7 PA 2201", driver: "Binod Magar", inTime: "07:15", securityBy: "Gate 2",
  }));
  push("grns", rec("grns", "GRN-002", "GRN — Green Masterbatch (pending QC)", "2026-08-22", "in_progress", {
    purchaseOrder: "PO-003", supplierName: "Asia Masterbatch Co.", gateEntry: "GE-002", warehouse: "WH-RM",
    inspection: "Pending", batch: "RM-BATCH-0822", acceptedQty: 0, rejectedQty: 0,
  }, [makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 400, rate: 620, warehouse: "WH-RM" })]));
  push("purchase_bills", rec("purchase_bills", "BILL-002", "Exception — qty vs GRN", "2026-08-16", "pending_approval", {
    supplier: "SUP-001", supplierName: "Nepal Polymer Imports", purchaseOrder: "PO-001", grn: "GRN-001",
    dueDate: "2026-09-15", matchStatus: "Exception", matchNote: "Qty vs GRN: bill 6000 / accepted 4950",
    vendorInvoiceNo: "NPI/26/1199", paid: 0, freight: 0, duty: 0, clearing: 0,
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 6000, rate: 320, discountPct: 2 })]));
  push("ocr_bills", rec("ocr_bills", "OCR-002", "Scan waiting extract", "2026-08-21", "in_progress", {
    source: "Image Upload", vendor: "", invoiceNo: "", extractedTotal: 0, confidence: 0, matchStatus: "Pending",
  }));
  push("purchase_returns", rec("purchase_returns", "PRT-002", "Return draft — pending debit note", "2026-08-18", "draft", {
    supplier: "SUP-001", grn: "GRN-001", reason: "Short packing on last pallet", inspection: "Failed",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 20, rate: 320, batch: "RM-BATCH-0715" })]));

  /* ---------------- Inventory ---------------- */
  [...RM, ...FG].forEach((p, i) => {
    const isFg = i >= RM.length;
    push("products", rec("products", p.code, p.name, "2026-01-05", "active", {
      type: isFg ? "Finished Good" : "Raw Material", category: isFg ? "Compostable Bags" : "Polymers",
      uom: p.uom, altUom: isFg ? "CTN" : "BAG", rate: p.rate, valuation: "Weighted Average",
      onHand: [4950, 1200, 8000, 600, 62000, 41000, 18000, 900][i] ?? 1000,
      reserved: [500, 0, 400, 0, 20000, 0, 0, 100][i] ?? 0,
      inTransit: i === 1 ? 1500 : i === 6 ? 3000 : 0, reorderLevel: [2000, 1500, 3000, 400, 20000, 15000, 8000, 500][i] ?? 500,
      safetyStock: 800, moq: 1000, maxStock: [8000, 5000, 12000, 2000, 100000, 80000, 50000, 2000][i] ?? 5000,
      abcClass: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C",
      warehouse: isFg ? "WH-FG" : "WH-RM", hsCode: "3923.21", taxPct: 13, barcode: `978000${i}00${i}`,
      serialTracking: p.code === "FG-FILM-004" ? "Yes" : "No",
      alertOpen: p.code === "RM-PBAT-002" ? "Yes" : "No",
      reorderQuantity: 5000,
      leadTimeDays: isFg ? 3 : 7,
      preferredSupplier: isFg ? "" : "SUP-001",
    }));
  });
  [["RM-PLA-001", "WH-RM", 1000, 2000, 5000, 800, 10000, 7, "SUP-001"],
   ["RM-PBAT-002", "WH-RM", 500, 1500, 3000, 500, 5000, 10, "SUP-001"],
   ["FG-CORN-001", "WH-FG", 10000, 20000, 50000, 5000, 100000, 5, ""]].forEach(([product, wh, moq, reorder, rq, safety, max, lead, sup]) =>
    push("warehouse_item_plans", rec("warehouse_item_plans", `WHP-${product}`, `${product} @ ${wh}`, "2026-01-05", "active", {
      product, warehouse: wh, moq, reorderLevel: reorder, reorderQuantity: rq, safetyStock: safety, maxStock: max, leadTimeDays: lead, preferredSupplier: sup,
    })),
  );
  push("batches", rec("batches", "BATCH-001", "FG Batch — Cornstarch Carry Bag 12x16", "2026-07-12", "released", {
    product: "FG-CORN-001", workOrder: "WO-001", qty: 30000, mfgDate: "2026-07-12", expiry: "2028-07-12",
    rmBatches: "RM-BATCH-0715", qcStatus: "Passed", location: "WH-FG / A-01-02", serials: "SN-12001, SN-12002, SN-12003",
  }));
  push("batches", rec("batches", "RM-BATCH-0715", "RM Batch — PLA Resin", "2026-07-15", "released", {
    product: "RM-PLA-001", grn: "GRN-001", qty: 4950, expiry: "2027-07-15", qcStatus: "Passed", location: "WH-RM / R-02-01",
  }));
  push("batches", rec("batches", "BATCH-EXP", "Near-expiry wrap film", "2026-01-10", "hold", {
    product: "FG-FILM-004", qty: 40, mfgDate: "2025-09-01", expiry: "2026-09-01",
    qcStatus: "Passed", location: "WH-FG / A-01-01", serials: "SN-FILM-00401",
  }));
  const movements: Array<[string, string, string, number, string, string]> = [
    ["2026-07-15", "Receipt", "RM-PLA-001", 4950, "GRN-001", "WH-RM"],
    ["2026-07-16", "Issue", "RM-PLA-001", -1800, "MI-001", "WH-RM"],
    ["2026-07-12", "Production Receipt", "FG-CORN-001", 30000, "WO-001", "WH-FG"],
    ["2026-07-22", "Dispatch", "FG-CORN-001", -20000, "DN-001", "WH-FG"],
    ["2026-07-24", "Transfer Out", "FG-GRB-010", -3000, "TR-001", "WH-FG"],
  ];
  movements.forEach(([d, type, item, qty, ref, wh], i) =>
    push("stock_movements", rec("stock_movements", `SM-${100 + i}`, `${type} — ${item}`, d, "completed", {
      type, product: item, qty, reference: ref, warehouse: wh, by: "Hari Karki",
    })),
  );
  push("stock_adjustments", rec("stock_adjustments", "ADJ-001", "Cycle count variance adjustment", "2026-07-26", "pending_approval", {
    warehouse: "WH-FG", reason: "Count variance", countRef: "CNT-001", varianceValue: -8400,
  }, [makeLine({ item: "FG-GRB-010", description: "Compostable Garbage Bag 24x32", qty: -320, rate: 26, warehouse: "WH-FG" })]));

  /* ---------------- Warehouse ---------------- */
  [["WH-RM", "Raw Material Store", "Bhaktapur"], ["WH-FG", "Finished Goods Store", "Bhaktapur"], ["WH-QR", "Quarantine Store", "Bhaktapur"], ["WH-CS", "Dealer consignment — Pokhara", "Pokhara"]]
    .forEach(([c, nm, loc]) => push("warehouses", rec("warehouses", c, nm, "2026-01-01", "active", { location: loc, keeper: "Hari Karki", zones: 4, utilization: c === "WH-CS" ? 22 : 68 })));
  ["A-01-01", "A-01-02", "R-02-01", "Q-01-01"].forEach((b, i) =>
    push("bins", rec("bins", b, `Bin ${b}`, "2026-01-01", "active", {
      warehouse: i === 2 ? "WH-RM" : i === 3 ? "WH-QR" : "WH-FG", zone: b.split("-")[0], rack: b.split("-")[1],
      capacity: 5000, occupied: [3200, 4100, 2400, 300][i], product: [FG[0].code, FG[0].code, RM[0].code, FG[2].code][i],
    })),
  );
  push("bins", rec("bins", "DLR-PKR", "Dealer consignment bin — Pokhara", "2026-02-10", "active", {
    warehouse: "WH-CS", zone: "C", rack: "01", capacity: 20000, occupied: 0, product: FG[2].code,
  }));
  push("stock_transfers", rec("stock_transfers", "TR-001", "WH-FG → Dealer consignment Pokhara", "2026-07-24", "in_progress", {
    source: "WH-FG", destination: "Dealer consignment — Pokhara", destWarehouse: "WH-CS",
    vehicle: "GA 1 KHA 3321", stage: "In Transit", requestedBy: "Sunita Gurung",
  }, [makeLine({ item: FG[2].code, description: FG[2].name, qty: 3000, rate: 26 })]));
  push("stock_transfers", rec("stock_transfers", "TR-002", "WH-FG → WH-RM sample", "2026-08-20", "approved", {
    source: "WH-FG", destination: "WH-RM", destWarehouse: "WH-RM",
    vehicle: "BA 2 KHA 1100", stage: "Requested", requestedBy: "Hari Karki",
  }, [makeLine({ item: FG[1].code, description: FG[1].name, qty: 400, rate: 19 })]));
  push("bin_transfers", rec("bin_transfers", "BT-001", "A-01-01 → A-01-02", "2026-07-25", "completed", {
    warehouse: "WH-FG", sourceBin: "A-01-01", destinationBin: "A-01-02", product: FG[0].code, qty: 1200, by: "Hari Karki",
  }));
  push("bin_transfers", rec("bin_transfers", "BT-002", "A-01-02 → A-01-01", "2026-08-21", "in_progress", {
    warehouse: "WH-FG", sourceBin: "A-01-02", destinationBin: "A-01-01", product: FG[0].code, qty: 200, by: "Hari Karki",
  }));
  push("stock_counts", rec("stock_counts", "CNT-001", "Cycle count — Zone A", "2026-07-26", "completed", {
    warehouse: "WH-FG", zone: "A", countedBy: "Hari Karki", itemsCounted: 12, variances: 2, varianceValue: -8400, approval: "Pending", adjustment: "ADJ-001",
  }));
  push("stock_counts", rec("stock_counts", "CNT-002", "Cycle count — Zone R", "2026-08-21", "in_progress", {
    warehouse: "WH-RM", zone: "R", countedBy: "Hari Karki", itemsCounted: 6, variances: 1, varianceValue: -3200, approval: "Pending",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: -10, rate: 320, warehouse: "WH-RM" })]));

  push("products", rec("products", "SFG-SHEET-001", "Extruded sheet (phantom)", "2026-01-05", "active", {
    type: "Semi-Finished", category: "Sheet", uom: "PCS", altUom: "KG", rate: 8.5, valuation: "Weighted Average",
    onHand: 100, reserved: 0, inTransit: 0, reorderLevel: 0, safetyStock: 0, moq: 1000, maxStock: 50000,
    abcClass: "B", warehouse: "WH-RM", hsCode: "3920.10", taxPct: 13, barcode: "9780009001", serialTracking: "No", alertOpen: "No",
  }));

  /* ---------------- Production ---------------- */
  push("boms", rec("boms", "BOM-SFG", "Extruded sheet — phantom v1", "2026-04-01", "approved", {
    product: "SFG-SHEET-001", version: "v1", effectiveFrom: "2026-04-01", outputQty: 1000, unitCost: 2.1, approvedBy: "Bikash Thapa",
  }, [
    makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 1, rate: 320 }),
    makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 2, rate: 145 }),
  ]));
  push("boms", rec("boms", "BOM-001", "Cornstarch Carry Bag 12x16 — v3", "2026-05-01", "approved", {
    product: "FG-CORN-001", version: "v3", effectiveFrom: "2026-05-01", outputQty: 1000, unitCost: 9.4, approvedBy: "Bikash Thapa",
    componentMeta: {
      "RM-PLA-001": { scrapPct: 2, yieldPct: 98, substitute: "RM-PBAT-002" },
      "RM-PBAT-002": { scrapPct: 1, yieldPct: 99 },
      "RM-STA-003": { scrapPct: 3, yieldPct: 97 },
      "RM-MB-004": { scrapPct: 0, yieldPct: 100 },
    },
  }, [
    makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 6, rate: 320 }),
    makeLine({ item: RM[1].code, description: RM[1].name, uom: "KG", qty: 3, rate: 410 }),
    makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 2, rate: 145 }),
    makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 0.4, rate: 620 }),
  ]));
  push("boms", rec("boms", "BOM-001-v4", "Cornstarch Carry Bag 12x16 — v4 draft", "2026-08-10", "draft", {
    product: "FG-CORN-001", version: "v4", effectiveFrom: "2026-09-01", previousVersion: "BOM-001", outputQty: 1000, unitCost: 9.1,
    componentMeta: { "RM-PLA-001": { scrapPct: 1.5, yieldPct: 98.5, substitute: "RM-PBAT-002" } },
  }, [
    makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 5.8, rate: 320 }),
    makeLine({ item: RM[1].code, description: RM[1].name, uom: "KG", qty: 3.1, rate: 410 }),
    makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 2, rate: 145 }),
    makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 0.35, rate: 620 }),
  ]));
  push("boms", rec("boms", "BOM-002", "Compostable Garbage Bag 24x32 — v1", "2026-06-01", "approved", {
    product: "FG-GRB-010", version: "v1", effectiveFrom: "2026-06-01", outputQty: 1000, unitCost: 12.6, approvedBy: "Bikash Thapa",
    componentMeta: { "SFG-SHEET-001": { phantom: true, scrapPct: 1, yieldPct: 99 } },
  }, [
    makeLine({ item: "SFG-SHEET-001", description: "Extruded sheet (phantom)", uom: "PCS", qty: 1000, rate: 8.5 }),
    makeLine({ item: RM[1].code, description: RM[1].name, uom: "KG", qty: 4, rate: 410 }),
    makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 0.5, rate: 620 }),
  ]));
  push("production_plans", rec("production_plans", "PP-001", "August 2026 Master Plan", "2026-07-25", "approved", {
    period: "2026-08", version: "v1", planner: "Bikash Thapa", strategy: "Make to Stock", totalPlannedQty: 145000,
    independentDemand: [{ item: "RM-PLA-001", qty: 4000 }],
  }, [
    makeLine({ item: FG[0].code, description: FG[0].name, qty: 80000, rate: 14 }),
    makeLine({ item: FG[2].code, description: FG[2].name, qty: 65000, rate: 26 }),
  ]));
  push("production_plans", rec("production_plans", "PP-002", "August 2026 Master Plan (re-plan draft)", "2026-08-18", "draft", {
    period: "2026-08", version: "v2", planner: "Bikash Thapa", strategy: "Make to Order", totalPlannedQty: 145000,
    previousVersion: "PP-001", replanReason: "EXT-01 breakdown window — shift garbage-bag demand to week 33",
  }, [
    makeLine({ item: FG[0].code, description: FG[0].name, qty: 70000, rate: 14 }),
    makeLine({ item: FG[2].code, description: FG[2].name, qty: 75000, rate: 26 }),
  ]));
  push("mrp_runs", rec("mrp_runs", "MRP-001", "MRP Run — August 2026", "2026-07-26", "completed", {
    plan: "PP-001", period: "2026-08", warehouse: "WH-RM", lotSizing: "Lot-for-Lot", suggestions: 4, converted: 2,
    convertedItems: ["RM-STA-003", "RM-MB-004"],
    rows: [
      { item: "RM-PLA-001", itemType: "Raw Material", gross: 4800, onHand: 4950, allocated: 500, openPo: 0, wip: 0, net: 350, lotQty: 350, needBy: "2026-08-04", suggest: "Purchase Requisition", converted: false, leadDays: 10 },
      { item: "FG-CORN-001", itemType: "Finished Good", gross: 80000, onHand: 62000, allocated: 20000, openPo: 0, wip: 0, net: 38000, lotQty: 38000, needBy: "2026-08-04", suggest: "Work Order", converted: false, leadDays: 3 },
      { item: "RM-PBAT-002", itemType: "Raw Material", gross: 2400, onHand: 1200, allocated: 0, openPo: 1500, wip: 0, net: 0, lotQty: 0, needBy: "2026-08-06", suggest: "None", converted: false, leadDays: 12 },
      { item: "RM-STA-003", itemType: "Raw Material", gross: 1600, onHand: 8000, allocated: 400, openPo: 0, wip: 0, net: 0, lotQty: 0, needBy: "2026-08-06", suggest: "None", converted: true, leadDays: 6 },
    ],
  }));
  push("work_orders", rec("work_orders", "WO-001", "Cornstarch Carry Bag 12x16 — 30,000 PCS", "2026-07-10", "completed", {
    product: "FG-CORN-001", bom: "BOM-001", plannedQty: 30000, producedQty: 29650, scrapQty: 350, machine: "EXT-01",
    supervisor: "Bikash Thapa", plan: "PP-001", startDate: "2026-07-10", endDate: "2026-07-12", batch: "BATCH-001",
    standardCost: 278710, actualCost: 583875, materialCost: 576000, labourCost: 7875, variance: 305165,
  }, [], [{ entity: "batches", id: "batches:BATCH-001", label: "BATCH-001" }, { entity: "material_issues", id: "material_issues:MI-001", label: "MI-001" }]));
  push("work_orders", rec("work_orders", "WO-002", "Compostable Garbage Bag 24x32 — 40,000 PCS", "2026-07-27", "released", {
    product: "FG-GRB-010", bom: "BOM-002", plannedQty: 40000, producedQty: 0, scrapQty: 0, machine: "EXT-02",
    supervisor: "Bikash Thapa", plan: "PP-001", startDate: "2026-08-01", endDate: "2026-08-04",
  }));
  push("work_orders", rec("work_orders", "WO-003", "Cornstarch Carry Bag 12x16 — 10,000 PCS", "2026-08-20", "draft", {
    product: "FG-CORN-001", bom: "BOM-001", plannedQty: 10000, producedQty: 0, scrapQty: 0, machine: "EXT-01",
    supervisor: "Bikash Thapa", plan: "PP-001", startDate: "2026-08-25", endDate: "2026-08-26",
  }));
  push("material_issues", rec("material_issues", "MI-001", "Material Issue — WO-001", "2026-07-10", "completed", {
    workOrder: "WO-001", warehouse: "WH-RM", issuedBy: "Hari Karki", mode: "Manual",
  }, [makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 1800, rate: 320, batch: "RM-BATCH-0715" })]));
  push("operations", rec("operations", "OP-001", "Extrusion — WO-001", "2026-07-10", "completed", {
    workOrder: "WO-001", workCentre: "Extrusion", machine: "EXT-01", operator: "Kiran Magar",
    plannedHrs: 16, actualHrs: 17.5, outputQty: 29650, scrap: 350, rework: 120, downtimeMins: 45, downtimeReason: "Changeover",
  }));
  push("operations", rec("operations", "OP-002", "Extrusion — WO-002", "2026-08-01", "draft", {
    workOrder: "WO-002", workCentre: "Extrusion", machine: "EXT-02", operator: "Kiran Magar",
    plannedHrs: 16, actualHrs: 0, outputQty: 0, scrap: 0, rework: 0, downtimeMins: 0,
  }));
  [["EXT-01", "Extruder Line 1"], ["EXT-02", "Extruder Line 2"], ["PRN-01", "Flexo Printer"], ["SEL-01", "Sealing Machine"]]
    .forEach(([c, nm]) => push("machines", rec("machines", c, nm, "2026-01-01", "active", {
      workCentre: c.startsWith("EXT") ? "Extrusion" : c.startsWith("PRN") ? "Printing" : "Sealing",
      capacityPerHr: 2200, shift: "A", status: "Running", utilization: 78, lastMaintenance: "2026-07-01",
      maintenanceWindows: c === "EXT-01" ? [{ start: "2026-08-01T12:00", end: "2026-08-01T14:00" }] : [],
    })));
  push("machine_schedules", rec("machine_schedules", "MS-001", "Week 32 machine schedule", "2026-08-01", "released", {
    week: "2026-W32", planner: "Bikash Thapa",
    slots: [
      { machine: "EXT-01", workOrder: "WO-002", start: "2026-08-01T06:00", end: "2026-08-01T14:00", setupMins: 45 },
      { machine: "EXT-02", workOrder: "WO-002", start: "2026-08-01T14:00", end: "2026-08-01T22:00", setupMins: 30 },
      { machine: "PRN-01", workOrder: "WO-002", start: "2026-08-02T06:00", end: "2026-08-02T12:00", setupMins: 20 },
    ],
  }));

  /* ---------------- Quality ---------------- */
  push("quality_plans", rec("quality_plans", "QP-001", "ISO 17088 Finished Goods Plan", "2026-03-01", "active", {
    product: "FG-CORN-001", stage: "Final", sampleSize: "AQL 2.5", parameters: "Disintegration, Heavy Metals, Tensile",
    spec: [
      { parameter: "Disintegration (90d)", expected: "> 90%", instrument: "INS-001" },
      { parameter: "Heavy Metals", expected: "Within limit" },
      { parameter: "Seal Strength", expected: "> 12 N", instrument: "INS-001" },
    ],
  }));
  push("quality_plans", rec("quality_plans", "QP-002", "Incoming resin plan", "2026-03-01", "active", {
    product: "RM-PLA-001", stage: "Incoming", sampleSize: "n=20", parameters: "Moisture, MFI, Colour",
    spec: [
      { parameter: "Moisture %", expected: "< 0.3" },
      { parameter: "Melt Flow Index", expected: "3.0 - 4.5" },
      { parameter: "Colour", expected: "Natural" },
    ],
  }));
  push("quality_plans", rec("quality_plans", "QP-003", "Wrap film final plan", "2026-04-15", "active", {
    product: "FG-FILM-004", stage: "Final", sampleSize: "AQL 1.5", parameters: "Tensile, Heavy Metals, Disintegration",
    spec: [
      { parameter: "Tensile", expected: "> 18 MPa", instrument: "INS-001" },
      { parameter: "Heavy Metals", expected: "Within limit" },
      { parameter: "Disintegration (90d)", expected: "> 90%" },
    ],
  }));
  push("qc_inspections", rec("qc_inspections", "QC-001", "Incoming — PLA Resin GRN-001", "2026-07-15", "approved", {
    stage: "Incoming", reference: "GRN-001", product: "RM-PLA-001", batch: "RM-BATCH-0715", sampleSize: 20, defects: 1,
    result: "Pass", inspector: "QC Lead", disposition: "Release", qualityPlan: "QP-002",
    checks: [
      { parameter: "Moisture %", expected: "< 0.3", observed: "0.22", result: "Pass" },
      { parameter: "Melt Flow Index", expected: "3.0 - 4.5", observed: "3.8", result: "Pass" },
      { parameter: "Colour", expected: "Natural", observed: "Natural", result: "Pass" },
    ],
  }));
  push("qc_inspections", rec("qc_inspections", "QC-003", "In-Process — WO-001 extrusion", "2026-07-11", "approved", {
    stage: "In-Process", reference: "WO-001", product: "FG-CORN-001", batch: "BATCH-001", sampleSize: 16, defects: 0,
    result: "Pass", inspector: "QC Lead", disposition: "Release",
  }));
  push("qc_inspections", rec("qc_inspections", "QC-002", "Final — FG Batch BATCH-001", "2026-07-12", "approved", {
    stage: "Final", reference: "WO-001", product: "FG-CORN-001", batch: "BATCH-001", sampleSize: 32, defects: 2,
    result: "Pass", inspector: "QC Lead", disposition: "Release", qualityPlan: "QP-001",
    checks: [
      { parameter: "Disintegration (90d)", expected: "> 90%", observed: "94%", result: "Pass", instrument: "INS-001" },
      { parameter: "Heavy Metals", expected: "Within limit", observed: "Within limit", result: "Pass" },
      { parameter: "Seal Strength", expected: "> 12 N", observed: "11.4 N", result: "Fail", instrument: "INS-001" },
    ],
  }));
  push("qc_inspections", rec("qc_inspections", "QC-004", "Final — Wrap film BATCH-EXP", "2026-08-21", "draft", {
    stage: "Final", reference: "BATCH-EXP", product: "FG-FILM-004", batch: "BATCH-EXP", sampleSize: 8, defects: 0,
    inspector: "QC Lead", qualityPlan: "QP-003",
    checks: [
      { parameter: "Tensile", expected: "> 18 MPa", observed: "", result: "Pending", instrument: "INS-001" },
      { parameter: "Heavy Metals", expected: "Within limit", observed: "", result: "Pending" },
      { parameter: "Disintegration (90d)", expected: "> 90%", observed: "", result: "Pending" },
    ],
  }));
  push("quarantine", rec("quarantine", "QRN-001", "Hold — Sales Return SR-001", "2026-07-28", "hold", {
    product: "FG-CORN-001", batch: "BATCH-001", qty: 500, source: "Sales Return", reason: "Print defect", warehouse: "WH-QR",
  }));
  push("ncrs", rec("ncrs", "NCR-001", "Seal strength below specification", "2026-07-13", "open", {
    source: "Inspection", reference: "QC-002", severity: "Major", product: "FG-CORN-001", batch: "BATCH-001",
    problem: "Seal strength 11.4 N against spec > 12 N", rootCause: "Sealing bar temperature drift",
    disposition: "Rework", costImpact: 42000, capa: "CAPA-001", raisedBy: "QC Lead",
  }, [], [{ entity: "capas", id: "capas:CAPA-001", label: "CAPA-001" }]));
  push("ncrs", rec("ncrs", "NCR-002", "Masterbatch colour drift on RM-MB-004", "2026-08-20", "open", {
    source: "Inspection", reference: "GRN-002", severity: "Minor", product: "RM-MB-004", batch: "RM-BATCH-0822",
    problem: "Green masterbatch lot shows ΔE 1.8 vs standard 1.0", raisedBy: "QC Lead", costImpact: 12000,
  }));
  push("capas", rec("capas", "CAPA-001", "Sealing temperature control", "2026-07-14", "in_progress", {
    ncr: "NCR-001", owner: "Bikash Thapa", dueDate: "2026-08-15", stage: "Corrective Action",
    containment: "Quarantine affected batch and 100% re-test", rootCause: "Thermocouple calibration drift on SEL-01",
    correctiveAction: "Recalibrate thermocouple; replace controller", preventiveAction: "Monthly calibration schedule + alarm",
    effectiveness: "Pending verification",
  }));
  push("instruments", rec("instruments", "INS-001", "Tensile Tester TT-200", "2026-01-10", "active", {
    location: "QC Lab", lastCalibration: "2026-06-01", nextCalibration: "2026-12-01", status: "Calibrated",
  }));
  push("instruments", rec("instruments", "INS-002", "Moisture analyser MA-12", "2026-02-01", "active", {
    location: "Incoming lab", lastCalibration: "2026-02-01", nextCalibration: "2026-08-01", status: "Overdue",
  }));

  /* ---------------- HR ---------------- */
  const emps = [
    ["EMP-001", "Rajesh Sharma", "Sales", "Sales Manager", 85000],
    ["EMP-002", "Sita Rai", "Sales", "Sales Executive", 48000],
    ["EMP-003", "Bikash Thapa", "Production", "Production Head", 92000],
    ["EMP-004", "Hari Karki", "Warehouse", "Store Keeper", 38000],
    ["EMP-005", "Kiran Magar", "Production", "Machine Operator", 32000],
    ["EMP-006", "Anjali Basnet", "Accounts", "Accountant", 55000],
  ] as const;
  emps.forEach(([code, name, dept, desig, sal]) =>
    push("employees", rec("employees", code, name, "2025-04-01", "active", {
      department: dept, designation: desig, grade: "B", basicSalary: sal, joinDate: "2025-04-01",
      phone: "+977-9841" + code.slice(-3) + "22", email: `${name.split(" ")[0].toLowerCase()}@ecowrap.com.np`,
      branch: dept === "Production" || dept === "Warehouse" ? "Factory — Bhaktapur" : "Head Office — Kathmandu",
      leaveBalance: 12, skills: "ERP, MS Excel", contract: "Permanent", ssf: true,
    })),
  );
  emps.forEach(([code, name], i) => {
    for (let d = 1; d <= 10; d++) {
      const day = String(d).padStart(2, "0");
      const att =
        d % 7 === 0 ? "Leave" : d === 5 && i === 2 ? "Absent" : d === 3 && i === 1 ? "Half Day" : "Present";
      push(
        "attendance",
        rec("attendance", `ATT-${code}-08${day}`, `${name} — 2026-08-${day}`, `2026-08-${day}`, "completed", {
          employee: code,
          employeeName: name,
          shift: "A",
          checkIn: att === "Present" || att === "Half Day" ? `09:0${i}` : "",
          checkOut: att === "Present" ? `18:1${i}` : att === "Half Day" ? "13:00" : "",
          hours: att === "Present" ? 8 + (i % 2) : att === "Half Day" ? 4 : 0,
          overtime: att === "Present" && i % 3 === 0 ? 1.5 : 0,
          late: i === 4 && d === 1,
          status: att,
        }),
      );
    }
  });
  push("leave_requests", rec("leave_requests", "LV-001", "Sita Rai — Annual Leave", "2026-08-03", "pending_approval", {
    employee: "EMP-002", employeeName: "Sita Rai", type: "Annual", from: "2026-08-12", to: "2026-08-14", days: 3,
    reason: "Family function", balanceBefore: 12, managerApproval: "Pending", hrApproval: "Pending",
  }));
  push("payroll_runs", rec("payroll_runs", "PAYRUN-2026-07", "Payroll — July 2026", "2026-07-31", "approved", {
    period: "2026-07", employees: 6, gross: 350000, ssf: 38500, tax: 21400, net: 290100, stage: "Locked",
  }));
  emps.forEach(([code, name, dept, , sal]) =>
    push("payslips", rec("payslips", `PS-${code}-202607`, `${name} — July 2026`, "2026-07-31", "completed", {
      employee: code, employeeName: name, period: "2026-07", department: dept, basic: sal,
      allowances: Math.round(sal * 0.2), overtime: 2400, ssf: Math.round(sal * 0.11), cit: 1500,
      tax: Math.round(sal * 0.05), net: Math.round(sal * 1.2 + 2400 - sal * 0.11 - 1500 - sal * 0.05),
      payrun: "PAYRUN-2026-07",
    })),
  );
  push("performance_reviews", rec("performance_reviews", "PERF-001", "Sita Rai — FY 2082/83 H1", "2026-07-20", "in_progress", {
    employee: "EMP-002", employeeName: "Sita Rai", cycle: "FY2082/83 H1", selfRating: 4, managerRating: 4,
    finalRating: 0, goals: "NPR 12M sales, 10 new accounts", competencies: "Negotiation, CRM discipline",
    trainingNeeds: "Advanced negotiation", reviewer: "Rajesh Sharma",
  }));
  push("recruitment", rec("recruitment", "REQ-001", "Machine Operator — 2 positions", "2026-07-15", "open", {
    department: "Production", positions: 2, applicants: 14, stage: "Interview", hiringManager: "Bikash Thapa",
  }));

  /* ---------------- Accounting ---------------- */
  const accounts: Array<[string, string, string, number]> = [
    ["1100", "Cash in Hand", "Asset", 185000],
    ["1110", "NIC Asia Bank", "Asset", 4820000],
    ["1120", "Nabil Bank", "Asset", 2140000],
    ["1200", "Accounts Receivable", "Asset", 1897000],
    ["1300", "Inventory — Raw Material", "Asset", 3210000],
    ["1310", "Inventory — Finished Goods", "Asset", 2480000],
    ["2100", "Accounts Payable", "Liability", 1642000],
    ["2200", "VAT Payable", "Liability", 318000],
    ["2300", "SSF Payable", "Liability", 38500],
    ["3100", "Share Capital", "Equity", 10000000],
    ["4100", "Sales Revenue", "Income", 8940000],
    ["5100", "Cost of Goods Sold", "Expense", 5120000],
    ["5200", "Salaries & Wages", "Expense", 2100000],
    ["5300", "Utilities", "Expense", 385000],
    ["5400", "Freight & Transport", "Expense", 212000],
  ];
  accounts.forEach(([code, name, group, bal]) =>
    push("accounts", rec("accounts", code, name, "2026-01-01", "active", {
      group, type: group, balance: bal, currency: "NPR", costCentre: "Corporate",
    })),
  );
  push("vouchers", rec("vouchers", "JV-001", "Sales Invoice INV-001 posting", "2026-07-22", "posted", {
    type: "Journal", reference: "INV-001", narration: "Sales to Himalayan Organic Foods", branch: "Head Office — Kathmandu",
  }, [
    makeLine({ account: "1200", description: "Accounts Receivable", debit: 302650, credit: 0, costCentre: "Sales" }),
    makeLine({ account: "4100", description: "Sales Revenue", debit: 0, credit: 267833, costCentre: "Sales" }),
    makeLine({ account: "2200", description: "VAT Payable", debit: 0, credit: 34817, costCentre: "Sales" }),
  ], [{ entity: "invoices", id: "invoices:INV-001", label: "INV-001" }]));
  push("vouchers", rec("vouchers", "RV-001", "Receipt PAY-001", "2026-07-24", "posted", {
    type: "Receipt", reference: "PAY-001", narration: "Bank receipt from Himalayan Organic Foods", branch: "Head Office — Kathmandu",
  }, [
    makeLine({ account: "1110", description: "NIC Asia Bank", debit: 200000, credit: 0 }),
    makeLine({ account: "1200", description: "Accounts Receivable", debit: 0, credit: 200000 }),
  ], [{ entity: "payments", id: "payments:PAY-001", label: "PAY-001" }]));
  push("vouchers", rec("vouchers", "PV-001", "GRN-001 material inward", "2026-07-15", "posted", {
    type: "Journal", reference: "GRN-001", narration: "Material received from Nepal Polymer Imports", branch: "Factory — Bhaktapur",
  }, [
    makeLine({ account: "1300", description: "Inventory — Raw Material", debit: 1552320, credit: 0 }),
    makeLine({ account: "2100", description: "Accounts Payable", debit: 0, credit: 1552320 }),
  ], [{ entity: "grns", id: "grns:GRN-001", label: "GRN-001" }]));
  push("vouchers", rec("vouchers", "PV-002", "Vendor payment VP-001", "2026-07-30", "posted", {
    type: "Payment", reference: "VP-001", narration: "Payment to Nepal Polymer Imports", branch: "Head Office — Kathmandu",
  }, [
    makeLine({ account: "2100", description: "Accounts Payable", debit: 800000, credit: 0 }),
    makeLine({ account: "1120", description: "Nabil Bank", debit: 0, credit: 800000 }),
  ]));
  push("expenses", rec("expenses", "EXP-001", "Factory electricity — July", "2026-07-31", "approved", {
    category: "Utilities", account: "5300", amount: 128000, paidBy: "Nabil Bank", branch: "Factory — Bhaktapur",
  }));
  push("assets", rec("assets", "AST-001", "Extruder Line 1", "2025-06-01", "active", {
    category: "Plant & Machinery", cost: 8500000, depreciationPct: 15, wdv: 7225000, location: "Factory — Bhaktapur",
  }));
  push("cost_centres", rec("cost_centres", "CC-001", "Sales", "2026-01-01", "active", { manager: "Rajesh Sharma", budget: 1200000, actual: 940000 }));
  push("cost_centres", rec("cost_centres", "CC-002", "Production", "2026-01-01", "active", { manager: "Bikash Thapa", budget: 5200000, actual: 4830000 }));

  /* ---------------- Platform / system ---------------- */
  push("whatsapp_templates", rec("whatsapp_templates", "WA-001", "Quotation dispatch", "2026-05-10", "active", {
    category: "Sales", variables: "{{customer}}, {{quotation}}, {{amount}}",
    body: "Namaste {{customer}}, your quotation {{quotation}} for NPR {{amount}} is attached. — EcoWrap Nepal",
    approvalStatus: "Approved", sent: 42, delivered: 40, read: 31,
  }));
  push("workflow_rules", rec("workflow_rules", "WF-001", "Low stock → notify Store Manager", "2026-04-01", "active", {
    trigger: "Stock below reorder level", condition: "product.onHand < product.reorderLevel",
    action: "Create alert + notify", recipient: "Warehouse Manager", schedule: "Realtime", runs: 26,
  }));
  push("workflow_rules", rec("workflow_rules", "WF-002", "Invoice overdue → notify Accounts", "2026-04-01", "active", {
    trigger: "Invoice overdue", condition: "invoice.dueDate < today && invoice.balance > 0",
    action: "Notify + create task", recipient: "Accounts", schedule: "Daily 09:00", runs: 12,
  }));
  push("rfid_tags", rec("rfid_tags", "TAG-0001", "Pallet tag — FG Zone A", "2026-06-01", "active", {
    reader: "RDR-01", assignedTo: "BATCH-001", location: "WH-FG / A-01-02", lastSeen: "2026-08-01T11:20:00Z", events: 128,
  }));
  push("iot_sensors", rec("iot_sensors", "SEN-001", "EXT-01 Barrel Temperature", "2026-06-01", "active", {
    machine: "EXT-01", metric: "Temperature", value: 182, unit: "°C", threshold: 195, health: "Normal", runtimeHrs: 1420, downtimeHrs: 36,
  }));
  push("iot_sensors", rec("iot_sensors", "SEN-002", "SEL-01 Sealing Pressure", "2026-06-01", "active", {
    machine: "SEL-01", metric: "Pressure", value: 6.4, unit: "bar", threshold: 7.0, health: "Warning", runtimeHrs: 980, downtimeHrs: 51,
  }));
  push("backups", rec("backups", "BKP-2026-08-01", "Nightly backup", "2026-08-01", "completed", {
    size: "412 MB", storage: "Encrypted object storage", retention: "30 days", duration: "3m 12s", type: "Automatic",
  }));

  applyBulkSeed({ push, rec, makeLine, FG, RM });

  return db;
}
