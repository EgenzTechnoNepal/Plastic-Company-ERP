import type { DocStatus } from "@/types/erp";

export type FieldType = "text" | "textarea" | "number" | "currency" | "date" | "select" | "ref" | "switch" | "email" | "phone";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  refEntity?: string;
  help?: string;
  section?: string;
  colSpan?: 1 | 2;
}

export interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "currency" | "number" | "date" | "status" | "percent";
  align?: "left" | "right";
  primary?: boolean;
}

export interface EntityDef {
  key: string;
  label: string;
  singular: string;
  module: string;
  moduleLabel: string;
  prefix: string;
  documentType?: string;
  department?: string;
  statuses: DocStatus[];
  workflow?: DocStatus[];
  columns: ColumnDef[];
  fields: FieldDef[];
  lines?: "items" | "ledger";
  titleField?: string;
  searchable?: string[];
  printable?: boolean;
}

const S = {
  doc: ["draft", "pending_approval", "approved", "rejected", "returned", "cancelled"] as DocStatus[],
  master: ["active", "inactive"] as DocStatus[],
  flow: ["draft", "submitted", "approved", "in_progress", "completed", "cancelled"] as DocStatus[],
  post: ["draft", "pending_approval", "approved", "posted", "reversed", "cancelled", "rejected", "returned"] as DocStatus[],
};

const f = (key: string, label: string, type: FieldType = "text", extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, ...extra });

export const ENTITIES: EntityDef[] = [
  /* ---------- CRM ---------- */
  {
    key: "customers", label: "Customers", singular: "Customer", module: "crm", moduleLabel: "CRM", prefix: "CUST",
    department: "Sales", statuses: S.master,
    columns: [
      { key: "code", label: "Code", primary: true }, { key: "title", label: "Customer Name" },
      { key: "fields.city", label: "City" }, { key: "fields.phone", label: "Phone" },
      { key: "fields.creditLimit", label: "Credit Limit", type: "currency", align: "right" },
      { key: "fields.outstanding", label: "Outstanding", type: "currency", align: "right" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("name", "Customer Name", "text", { required: true, section: "Identity" }),
      f("type", "Customer Type", "select", { options: ["Corporate", "Retail", "Government", "Dealer"], section: "Identity" }),
      f("contactPerson", "Contact Person", "text", { section: "Identity" }),
      f("phone", "Phone", "phone", { required: true, section: "Identity" }),
      f("email", "Email", "email", { section: "Identity" }),
      f("city", "City", "text", { section: "Address" }),
      f("address", "Address", "textarea", { section: "Address", colSpan: 2 }),
      f("pan", "PAN / VAT No.", "text", { section: "Compliance" }),
      f("territory", "Territory", "ref", { refEntity: "territories", section: "Commercial" }),
      f("priceList", "Price List", "select", { options: ["Standard", "Dealer", "Institutional"], section: "Commercial" }),
      f("creditLimit", "Credit Limit", "currency", { section: "Commercial" }),
      f("creditDays", "Credit Days", "number", { section: "Commercial" }),
      f("outstanding", "Opening Outstanding", "currency", { section: "Commercial" }),
    ],
    searchable: ["code", "title", "fields.city", "fields.phone"],
  },
  {
    key: "contacts", label: "Contacts", singular: "Contact", module: "crm", moduleLabel: "CRM", prefix: "CON",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Name" }, { key: "fields.customer", label: "Customer" }, { key: "fields.designation", label: "Designation" }, { key: "fields.phone", label: "Phone" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Full Name", "text", { required: true }), f("customer", "Customer", "ref", { refEntity: "customers", required: true }),
      f("designation", "Designation"), f("phone", "Phone", "phone"), f("email", "Email", "email"),
    ],
  },
  {
    key: "leads", label: "Leads", singular: "Lead", module: "crm", moduleLabel: "CRM", prefix: "LEAD",
    department: "Sales", statuses: ["open", "in_progress", "completed", "closed"],
    columns: [
      { key: "code", label: "Lead", primary: true }, { key: "title", label: "Company" },
      { key: "fields.stage", label: "Stage" }, { key: "fields.owner", label: "Owner" },
      { key: "fields.expectedValue", label: "Expected Value", type: "currency", align: "right" },
      { key: "fields.probability", label: "Prob. %", type: "percent", align: "right" },
    ],
    fields: [
      f("name", "Company / Lead Name", "text", { required: true }),
      f("stage", "Stage", "select", { options: ["new", "qualification", "proposal", "negotiation", "won", "lost"], required: true }),
      f("source", "Source", "select", { options: ["Website", "Referral", "Trade Fair", "Cold Call", "Campaign"] }),
      f("owner", "Owner", "text"), f("phone", "Phone", "phone"), f("city", "City"),
      f("expectedValue", "Expected Value", "currency"), f("probability", "Probability %", "number"),
      f("expectedClose", "Expected Close", "date"),
      f("lostReason", "Lost Reason", "select", { options: ["Price", "Competitor", "No budget", "Timing", "Spec mismatch", "Other"], colSpan: 2 }),
    ],
  },
  {
    key: "opportunities", label: "Opportunities", singular: "Opportunity", module: "crm", moduleLabel: "CRM", prefix: "OPP",
    statuses: ["open", "in_progress", "completed", "closed"],
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Opportunity" }, { key: "fields.customer", label: "Customer" }, { key: "fields.stage", label: "Stage" }, { key: "fields.value", label: "Value", type: "currency", align: "right" }, { key: "fields.probability", label: "Prob. %", type: "percent", align: "right" }],
    fields: [
      f("name", "Opportunity", "text", { required: true }), f("customer", "Customer", "text"),
      f("stage", "Stage", "select", { options: ["qualification", "proposal", "negotiation", "won", "lost"] }),
      f("value", "Value", "currency"), f("probability", "Probability %", "number"),
      f("owner", "Owner"), f("expectedClose", "Expected Close", "date"),
      f("lead", "Source Lead", "ref", { refEntity: "leads" }),
    ],
  },
  {
    key: "activities", label: "Activities", singular: "Activity", module: "crm", moduleLabel: "CRM", prefix: "ACT",
    statuses: ["open", "completed", "cancelled"],
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Subject" }, { key: "fields.type", label: "Type" }, { key: "fields.dueDate", label: "Due", type: "date" }, { key: "fields.owner", label: "Owner" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Subject", "text", { required: true }),
      f("type", "Type", "select", { options: ["Call", "Meeting", "Email", "Visit", "Demo"] }),
      f("customer", "Customer", "ref", { refEntity: "customers" }), f("owner", "Owner"),
      f("outcome", "Outcome", "textarea", { colSpan: 2 }), f("nextAction", "Next Action"), f("nextDate", "Next Action Date", "date"),
      f("dueDate", "Follow-up due", "date"),
    ],
  },
  {
    key: "dealers", label: "Dealers & Agents", singular: "Dealer", module: "crm", moduleLabel: "CRM", prefix: "DLR",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Dealer" }, { key: "fields.territory", label: "Territory" }, { key: "fields.target", label: "Target", type: "currency", align: "right" }, { key: "fields.achievement", label: "Achievement", type: "currency", align: "right" }, { key: "fields.commissionEarned", label: "Commission", type: "currency", align: "right" }],
    fields: [f("name", "Dealer Name", "text", { required: true }), f("territory", "Territory", "ref", { refEntity: "territories" }), f("commissionPct", "Commission %", "number"), f("contact", "Contact", "phone"), f("ytdSales", "YTD Sales", "currency"), f("target", "Annual Target", "currency"), f("achievement", "Achievement", "currency"), f("consignmentStock", "Consignment Stock (NPR)", "currency")],
  },
  {
    key: "territories", label: "Territories", singular: "Territory", module: "crm", moduleLabel: "CRM", prefix: "TER",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Territory" }, { key: "fields.owner", label: "Owner" }, { key: "fields.customers", label: "Customers", type: "number", align: "right" }],
    fields: [f("name", "Territory", "text", { required: true }), f("owner", "Owner"), f("customers", "Customer Count", "number")],
  },
  {
    key: "tickets", label: "After-sales Tickets", singular: "Ticket", module: "crm", moduleLabel: "CRM", prefix: "TKT",
    department: "Sales", statuses: ["open", "in_progress", "hold", "closed"],
    columns: [
      { key: "code", label: "Ticket", primary: true }, { key: "title", label: "Subject" },
      { key: "fields.customer", label: "Customer" }, { key: "fields.priority", label: "Priority" },
      { key: "fields.dueAt", label: "SLA due", type: "date" }, { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("name", "Subject", "text", { required: true, section: "Ticket" }),
      f("customer", "Customer", "ref", { refEntity: "customers", required: true, section: "Ticket" }),
      f("priority", "Priority", "select", { options: ["low", "normal", "high"], required: true, section: "Ticket" }),
      f("slaHours", "SLA hours", "number", { required: true, section: "SLA" }),
      f("openedAt", "Opened at", "text", { section: "SLA" }),
      f("dueAt", "Due at", "text", { section: "SLA" }),
      f("assignee", "Assignee", "text", { section: "Ticket" }),
      f("complaint", "Complaint", "textarea", { colSpan: 2, section: "Ticket" }),
    ],
    searchable: ["code", "title", "fields.customer"],
  },
  {
    key: "quotations", label: "Quotations", singular: "Quotation", module: "crm", moduleLabel: "CRM", prefix: "QT",
    documentType: "Quotation", department: "Sales", statuses: S.doc, lines: "items", printable: true,
    workflow: ["draft", "pending_approval", "approved", "completed"],
    columns: [
      { key: "code", label: "Quotation", primary: true }, { key: "fields.customerName", label: "Customer" },
      { key: "date", label: "Date", type: "date" }, { key: "fields.revision", label: "Rev" },
      { key: "total", label: "Amount", type: "currency", align: "right" }, { key: "fields.dispatchStatus", label: "Dispatch" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("customer", "Customer", "ref", { refEntity: "customers", required: true, section: "Header" }),
      f("customerName", "Customer Name", "text", { section: "Header" }),
      f("revision", "Revision", "select", { options: ["Rev 01", "Rev 02", "Rev 03"], section: "Header" }),
      f("validTill", "Valid Till", "date", { section: "Header" }),
      f("paymentTerms", "Payment Terms", "select", { options: ["Advance", "15 Days Credit", "30 Days Credit", "45 Days Credit"], section: "Commercial" }),
      f("currency", "Currency", "select", { options: ["NPR", "USD", "INR"], section: "Commercial" }),
      f("salesperson", "Salesperson", "text", { section: "Commercial" }),
      f("channel", "Dispatch Channel", "select", { options: ["Email", "WhatsApp", "SMS", "Print"], section: "Commercial" }),
      f("dispatchStatus", "Dispatch Status", "text", { section: "Commercial" }),
      f("tracking", "Tracking ref", "text", { section: "Commercial" }),
      f("terms", "Terms & Conditions", "textarea", { section: "Notes", colSpan: 2 }),
    ],
  },

  /* ---------- Sales ---------- */
  {
    key: "sales_orders", label: "Sales Orders", singular: "Sales Order", module: "sales", moduleLabel: "Sales", prefix: "SO",
    documentType: "Sales Order", department: "Sales", statuses: ["draft", "pending_approval", "approved", "in_progress", "completed", "cancelled"],
    lines: "items", printable: true, workflow: ["draft", "pending_approval", "approved", "in_progress", "completed"],
    columns: [
      { key: "code", label: "Order", primary: true }, { key: "fields.customerName", label: "Customer" },
      { key: "date", label: "Date", type: "date" }, { key: "fields.deliveryDate", label: "Delivery", type: "date" },
      { key: "total", label: "Amount", type: "currency", align: "right" },
      { key: "fields.dispatchStatus", label: "Dispatch" }, { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("customer", "Customer", "ref", { refEntity: "customers", required: true, section: "Header" }),
      f("customerName", "Customer Name", "text", { section: "Header" }),
      f("quotation", "Quotation Ref", "ref", { refEntity: "quotations", section: "Header" }),
      f("branch", "Branch", "ref", { refEntity: "branches", section: "Header" }),
      f("deliveryDate", "Delivery Date", "date", { required: true, section: "Logistics" }),
      f("paymentTerms", "Payment Terms", "select", { options: ["Advance", "15 Days Credit", "30 Days Credit", "45 Days Credit"], section: "Commercial" }),
      f("currency", "Currency", "select", { options: ["NPR", "USD"], section: "Commercial" }),
      f("salesperson", "Salesperson", "text", { section: "Commercial" }),
      f("allocationStatus", "Allocation", "text", { section: "Fulfilment" }),
      f("pickStatus", "Picking", "text", { section: "Fulfilment" }),
      f("packStatus", "Packing", "text", { section: "Fulfilment" }),
      f("dispatchStatus", "Dispatch", "text", { section: "Fulfilment" }),
      f("gatePass", "Gate Pass", "text", { section: "Fulfilment" }),
      f("invoiceStatus", "Invoice", "text", { section: "Fulfilment" }),
      f("paymentStatus", "Payment", "text", { section: "Fulfilment" }),
      f("remarks", "Remarks", "textarea", { section: "Notes", colSpan: 2 }),
    ],
  },
  {
    key: "deliveries", label: "Dispatch & Delivery", singular: "Delivery Challan", module: "sales", moduleLabel: "Sales", prefix: "DN",
    statuses: S.flow, lines: "items", printable: true,
    columns: [{ key: "code", label: "Challan", primary: true }, { key: "fields.customerName", label: "Customer" }, { key: "fields.salesOrder", label: "Sales Order" }, { key: "date", label: "Date", type: "date" }, { key: "fields.vehicle", label: "Vehicle" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("salesOrder", "Sales Order", "ref", { refEntity: "sales_orders", required: true }),
      f("customerName", "Customer"), f("vehicle", "Vehicle No."), f("driver", "Driver"),
      f("gatePass", "Gate Pass No."), f("destination", "Destination"), f("packedBy", "Packed By"),
    ],
  },
  {
    key: "invoices", label: "Sales Invoices", singular: "Invoice", module: "sales", moduleLabel: "Sales", prefix: "INV",
    documentType: "Sales Invoice", department: "Sales", statuses: S.post, lines: "items", printable: true,
    workflow: ["draft", "pending_approval", "posted"],
    columns: [
      { key: "code", label: "Invoice", primary: true }, { key: "fields.customerName", label: "Customer" },
      { key: "date", label: "Date", type: "date" }, { key: "fields.dueDate", label: "Due", type: "date" },
      { key: "total", label: "Amount", type: "currency", align: "right" },
      { key: "fields.paid", label: "Paid", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("customer", "Customer", "ref", { refEntity: "customers", required: true, section: "Header" }),
      f("customerName", "Customer Name", "text", { section: "Header" }),
      f("salesOrder", "Sales Order", "ref", { refEntity: "sales_orders", section: "Header" }),
      f("delivery", "Delivery Challan", "ref", { refEntity: "deliveries", section: "Header" }),
      f("dueDate", "Due Date", "date", { section: "Commercial" }),
      f("buyerPan", "Buyer PAN", "text", { section: "Compliance" }),
      f("fiscalYear", "Fiscal Year", "select", { options: ["2081/82", "2082/83"], section: "Compliance" }),
    ],
  },
  {
    key: "payments", label: "Customer Payments", singular: "Payment", module: "sales", moduleLabel: "Sales", prefix: "PAY",
    statuses: S.post,
    columns: [{ key: "code", label: "Receipt", primary: true }, { key: "fields.customerName", label: "Customer" }, { key: "date", label: "Date", type: "date" }, { key: "fields.mode", label: "Mode" }, { key: "fields.amount", label: "Amount", type: "currency", align: "right" }, { key: "fields.allocatedTo", label: "Allocated To" }],
    fields: [
      f("customer", "Customer", "ref", { refEntity: "customers", required: true }),
      f("customerName", "Customer Name"),
      f("mode", "Payment Mode", "select", { options: ["Cash", "Bank Transfer", "Cheque", "eSewa", "Khalti"], required: true }),
      f("bank", "Bank / Wallet"), f("reference", "Reference No."),
      f("amount", "Amount", "currency", { required: true }),
      f("allocatedTo", "Allocate to Invoice", "ref", { refEntity: "invoices" }),
    ],
  },
  {
    key: "sales_returns", label: "Sales Returns", singular: "Sales Return", module: "sales", moduleLabel: "Sales", prefix: "SR",
    documentType: "Sales Return", department: "Sales", statuses: ["draft", "submitted", "approved", "completed", "rejected"], lines: "items",
    columns: [{ key: "code", label: "Return", primary: true }, { key: "fields.customerName", label: "Customer" }, { key: "fields.originalInvoice", label: "Invoice" }, { key: "date", label: "Date", type: "date" }, { key: "fields.disposition", label: "Disposition" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("customer", "Customer", "ref", { refEntity: "customers", required: true }),
      f("customerName", "Customer Name"),
      f("originalInvoice", "Original Invoice", "ref", { refEntity: "invoices", required: true }),
      f("reason", "Return Reason", "textarea", { required: true, colSpan: 2 }),
      f("authorisedBy", "Authorised By", "text"),
      f("inspection", "Inspection Result", "select", { options: ["Pending", "Passed", "Failed"] }),
      f("disposition", "Disposition", "select", { options: ["Restock", "Quarantine", "Reject"] }),
      f("quarantineRef", "Quarantine Ref", "text"),
      f("creditNote", "Credit Note", "ref", { refEntity: "credit_notes" }),
      f("ncr", "NCR", "ref", { refEntity: "ncrs" }),
    ],
  },
  {
    key: "credit_notes", label: "Credit Notes", singular: "Credit Note", module: "sales", moduleLabel: "Sales", prefix: "CRN",
    statuses: S.post, lines: "items", printable: true,
    columns: [{ key: "code", label: "Credit Note", primary: true }, { key: "fields.customerName", label: "Customer" }, { key: "fields.salesReturn", label: "Return Ref" }, { key: "date", label: "Date", type: "date" }, { key: "fields.amount", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("customerName", "Customer"), f("salesReturn", "Sales Return", "ref", { refEntity: "sales_returns" }), f("amount", "Amount", "currency"), f("reason", "Reason", "textarea", { colSpan: 2 })],
  },

  /* ---------- Purchase ---------- */
  {
    key: "suppliers", label: "Suppliers", singular: "Supplier", module: "purchase", moduleLabel: "Purchase", prefix: "SUP",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Supplier" }, { key: "fields.category", label: "Category" }, { key: "fields.rating", label: "Rating", type: "number", align: "right" }, { key: "fields.outstanding", label: "Outstanding", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Supplier Name", "text", { required: true }), f("category", "Category", "select", { options: ["PLA/PBAT Resin", "Corn Starch", "Additives", "Packaging", "Services"] }),
      f("phone", "Phone", "phone"), f("email", "Email", "email"), f("pan", "PAN / VAT No."),
      f("paymentTerms", "Payment Terms", "select", { options: ["Advance", "15 Days", "30 Days", "45 Days"] }),
      f("rating", "Rating (1-5)", "number"), f("outstanding", "Outstanding", "currency"),
    ],
  },
  {
    key: "purchase_requisitions", label: "Purchase Requisitions", singular: "Purchase Requisition", module: "purchase", moduleLabel: "Purchase", prefix: "PR",
    documentType: "Purchase Requisition", department: "Purchase", statuses: S.doc, lines: "items",
    workflow: ["draft", "pending_approval", "approved", "completed"],
    columns: [{ key: "code", label: "PR", primary: true }, { key: "title", label: "Subject" }, { key: "fields.department", label: "Department" }, { key: "fields.requiredBy", label: "Required By", type: "date" }, { key: "total", label: "Value", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Subject", "text", { required: true }), f("department", "Department", "ref", { refEntity: "departments" }),
      f("requestedBy", "Requested By"), f("requiredBy", "Required By", "date", { required: true }),
      f("priority", "Priority", "select", { options: ["Low", "Normal", "High", "Urgent"] }),
      f("justification", "Justification", "textarea", { colSpan: 2 }),
    ],
  },
  {
    key: "rfqs", label: "RFQ & Comparison", singular: "RFQ", module: "purchase", moduleLabel: "Purchase", prefix: "RFQ",
    statuses: S.flow, lines: "items",
    columns: [{ key: "code", label: "RFQ", primary: true }, { key: "title", label: "Subject" }, { key: "fields.requisition", label: "PR Ref" }, { key: "fields.closingDate", label: "Closing", type: "date" }, { key: "fields.selectedVendor", label: "Selected Vendor" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Subject", "text", { required: true }), f("requisition", "Purchase Requisition", "ref", { refEntity: "purchase_requisitions" }),
      f("vendors", "Invited Vendors"), f("closingDate", "Closing Date", "date"), f("selectedVendor", "Selected Vendor", "ref", { refEntity: "suppliers" }),
    ],
  },
  {
    key: "purchase_orders", label: "Purchase Orders", singular: "Purchase Order", module: "purchase", moduleLabel: "Purchase", prefix: "PO",
    documentType: "Purchase Order", department: "Purchase", statuses: ["draft", "pending_approval", "approved", "in_progress", "completed", "cancelled"],
    lines: "items", printable: true, workflow: ["draft", "pending_approval", "approved", "completed"],
    columns: [{ key: "code", label: "PO", primary: true }, { key: "fields.supplierName", label: "Supplier" }, { key: "date", label: "Date", type: "date" }, { key: "fields.deliveryDate", label: "Delivery", type: "date" }, { key: "total", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("supplier", "Supplier", "ref", { refEntity: "suppliers", required: true, section: "Header" }),
      f("supplierName", "Supplier Name", "text", { section: "Header" }),
      f("requisition", "Requisition", "ref", { refEntity: "purchase_requisitions", section: "Header" }),
      f("rfq", "RFQ", "ref", { refEntity: "rfqs", section: "Header" }),
      f("deliveryDate", "Delivery Date", "date", { section: "Logistics" }),
      f("paymentTerms", "Payment Terms", "select", { options: ["Advance", "15 Days", "30 Days", "45 Days"], section: "Commercial" }),
      f("currency", "Currency", "select", { options: ["NPR", "USD", "INR"], section: "Commercial" }),
      f("freight", "Freight", "currency", { section: "Landed cost" }),
      f("duty", "Duty", "currency", { section: "Landed cost" }),
      f("clearing", "Clearing", "currency", { section: "Landed cost" }),
      f("amendment", "Amendment", "text", { section: "Header" }),
      f("receiptStatus", "Receipt", "text", { section: "Fulfilment" }),
      f("billStatus", "Bill", "text", { section: "Fulfilment" }),
    ],
  },
  {
    key: "gate_entries", label: "Gate Entries", singular: "Gate Entry", module: "purchase", moduleLabel: "Purchase", prefix: "GE",
    statuses: S.flow,
    columns: [{ key: "code", label: "Gate Entry", primary: true }, { key: "fields.purchaseOrder", label: "PO" }, { key: "date", label: "Date", type: "date" }, { key: "fields.vehicle", label: "Vehicle" }, { key: "fields.inTime", label: "In Time" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("purchaseOrder", "Purchase Order", "ref", { refEntity: "purchase_orders", required: true }), f("vehicle", "Vehicle No."), f("driver", "Driver"), f("inTime", "In Time"), f("securityBy", "Security Post")],
  },
  {
    key: "grns", label: "Goods Receipts (GRN)", singular: "GRN", module: "purchase", moduleLabel: "Purchase", prefix: "GRN",
    statuses: S.flow, lines: "items", printable: true,
    columns: [{ key: "code", label: "GRN", primary: true }, { key: "fields.supplierName", label: "Supplier" }, { key: "fields.purchaseOrder", label: "PO" }, { key: "date", label: "Date", type: "date" }, { key: "fields.inspection", label: "Inspection" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("purchaseOrder", "Purchase Order", "ref", { refEntity: "purchase_orders", required: true }),
      f("supplierName", "Supplier"), f("gateEntry", "Gate Entry", "ref", { refEntity: "gate_entries" }),
      f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true }),
      f("batch", "Batch No."), f("inspection", "Inspection", "select", { options: ["Pending", "Passed", "Failed"] }),
      f("acceptedQty", "Accepted Qty", "number"), f("rejectedQty", "Rejected Qty", "number"),
      f("putawayStatus", "Put-away", "select", { options: ["Pending", "Put away"] }),
      f("putawayBin", "Put-away Bin", "ref", { refEntity: "bins" }),
    ],
  },
  {
    key: "purchase_bills", label: "Vendor Bills", singular: "Vendor Bill", module: "purchase", moduleLabel: "Purchase", prefix: "BILL",
    documentType: "Vendor Bill", department: "Accounts", statuses: S.doc, lines: "items",
    columns: [{ key: "code", label: "Bill", primary: true }, { key: "fields.supplierName", label: "Supplier" }, { key: "fields.grn", label: "GRN" }, { key: "fields.dueDate", label: "Due", type: "date" }, { key: "total", label: "Amount", type: "currency", align: "right" }, { key: "fields.matchStatus", label: "3-Way Match" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("supplier", "Supplier", "ref", { refEntity: "suppliers", required: true }), f("supplierName", "Supplier Name"),
      f("vendorInvoiceNo", "Vendor Invoice No.", "text", { required: true }),
      f("purchaseOrder", "Purchase Order", "ref", { refEntity: "purchase_orders" }),
      f("grn", "GRN", "ref", { refEntity: "grns" }), f("dueDate", "Due Date", "date"),
      f("matchStatus", "Match Status", "select", { options: ["Pending", "3-Way Matched", "Exception"] }),
    ],
  },
  {
    key: "purchase_returns", label: "Purchase Returns", singular: "Purchase Return", module: "purchase", moduleLabel: "Purchase", prefix: "PRT",
    statuses: ["draft", "submitted", "approved", "completed"], lines: "items",
    columns: [{ key: "code", label: "Return", primary: true }, { key: "fields.supplier", label: "Supplier" }, { key: "fields.grn", label: "GRN" }, { key: "date", label: "Date", type: "date" }, { key: "fields.debitNote", label: "Debit Note" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("supplier", "Supplier", "ref", { refEntity: "suppliers", required: true }), f("grn", "GRN", "ref", { refEntity: "grns" }), f("reason", "Reason", "textarea", { required: true, colSpan: 2 }), f("inspection", "Inspection Result", "select", { options: ["Pending", "Passed", "Failed"] })],
  },
  {
    key: "debit_notes", label: "Debit Notes", singular: "Debit Note", module: "purchase", moduleLabel: "Purchase", prefix: "DBN",
    statuses: S.post, printable: true,
    columns: [{ key: "code", label: "Debit Note", primary: true }, { key: "fields.supplier", label: "Supplier" }, { key: "fields.purchaseReturn", label: "Return Ref" }, { key: "date", label: "Date", type: "date" }, { key: "fields.amount", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("supplier", "Supplier", "ref", { refEntity: "suppliers" }), f("purchaseReturn", "Purchase Return", "ref", { refEntity: "purchase_returns" }), f("amount", "Amount", "currency"), f("reason", "Reason", "textarea", { colSpan: 2 })],
  },
  {
    key: "vendor_payments", label: "Vendor Payments", singular: "Vendor Payment", module: "purchase", moduleLabel: "Purchase", prefix: "VP",
    statuses: S.post,
    columns: [{ key: "code", label: "Voucher", primary: true }, { key: "fields.supplier", label: "Supplier" }, { key: "fields.bill", label: "Bill" }, { key: "date", label: "Date", type: "date" }, { key: "fields.amount", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("supplier", "Supplier", "ref", { refEntity: "suppliers", required: true }), f("bill", "Vendor Bill", "ref", { refEntity: "purchase_bills" }), f("mode", "Mode", "select", { options: ["Cash", "Bank Transfer", "Cheque"] }), f("bank", "Bank"), f("reference", "Reference"), f("amount", "Amount", "currency", { required: true })],
  },
  {
    key: "ocr_bills", label: "OCR Bill Scanning", singular: "Scanned Bill", module: "purchase", moduleLabel: "Purchase", prefix: "OCR",
    statuses: S.flow,
    columns: [{ key: "code", label: "Scan", primary: true }, { key: "fields.vendor", label: "Vendor" }, { key: "fields.invoiceNo", label: "Invoice No." }, { key: "fields.extractedTotal", label: "Total", type: "currency", align: "right" }, { key: "fields.matchStatus", label: "Match" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("source", "Source", "select", { options: ["PDF Upload", "Image Upload", "Camera", "QR Scan"] }),
      f("vendor", "Vendor"), f("invoiceNo", "Invoice No."), f("pan", "Vendor PAN"), f("buyerPan", "Buyer PAN"),
      f("invoiceDate", "Invoice Date", "date"), f("extractedTotal", "Extracted Total", "currency"), f("vat", "VAT", "currency"),
      f("matchStatus", "Match Status", "select", { options: ["Pending", "Matched", "Mismatch", "Exception"] }),
    ],
  },

  /* ---------- Inventory & Warehouse ---------- */
  {
    key: "products", label: "Products", singular: "Product", module: "inventory", moduleLabel: "Inventory", prefix: "ITM",
    statuses: S.master,
    columns: [
      { key: "code", label: "Code", primary: true }, { key: "title", label: "Product" }, { key: "fields.type", label: "Type" },
      { key: "fields.onHand", label: "On Hand", type: "number", align: "right" },
      { key: "fields.reserved", label: "Reserved", type: "number", align: "right" },
      { key: "fields.reorderLevel", label: "Reorder", type: "number", align: "right" },
      { key: "fields.rate", label: "Rate", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      f("name", "Product Name", "text", { required: true, section: "Identity" }),
      f("type", "Product Type", "select", { options: ["Raw Material", "Semi-Finished", "Finished Good", "Consumable"], required: true, section: "Identity" }),
      f("category", "Category", "text", { section: "Identity" }),
      f("uom", "Base UOM", "select", { options: ["PCS", "KG", "ROLL", "CTN", "MTR"], required: true, section: "Identity" }),
      f("altUom", "Alternate UOM", "select", { options: ["PCS", "KG", "ROLL", "CTN", "BAG"], section: "Identity" }),
      f("rate", "Standard Rate", "currency", { section: "Costing" }),
      f("valuation", "Valuation Method", "select", { options: ["FIFO", "Weighted Average", "Standard Cost"], section: "Costing" }),
      f("taxPct", "Tax %", "number", { section: "Costing" }),
      f("onHand", "Opening Stock", "number", { section: "Planning" }),
      f("reserved", "Reserved", "number", { section: "Planning" }),
      f("inTransit", "In Transit", "number", { section: "Planning" }),
      f("reorderLevel", "Reorder Level", "number", { section: "Planning" }),
      f("reorderQuantity", "Reorder Quantity", "number", { section: "Planning" }),
      f("safetyStock", "Safety Stock", "number", { section: "Planning" }),
      f("moq", "MOQ", "number", { section: "Planning" }),
      f("maxStock", "Max Stock", "number", { section: "Planning" }),
      f("leadTimeDays", "Lead Time (days)", "number", { section: "Planning" }),
      f("abcClass", "ABC Class", "select", { options: ["A", "B", "C"], section: "Planning" }),
      f("warehouse", "Default Warehouse", "ref", { refEntity: "warehouses", section: "Planning" }),
      f("preferredSupplier", "Preferred Supplier", "ref", { refEntity: "suppliers", section: "Planning" }),
      f("barcode", "Barcode", "text", { section: "Identification" }),
      f("hsCode", "HS Code", "text", { section: "Identification" }),
      f("serialTracking", "Serial Tracking", "select", { options: ["Yes", "No"], section: "Identification" }),
      f("alertOpen", "Reorder Alert", "select", { options: ["Yes", "No"], section: "Planning" }),
    ],
  },
  {
    key: "batches", label: "Batches", singular: "Batch", module: "inventory", moduleLabel: "Inventory", prefix: "BATCH",
    statuses: ["draft", "hold", "released", "closed"],
    columns: [{ key: "code", label: "Batch", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.qty", label: "Qty", type: "number", align: "right" }, { key: "fields.expiry", label: "Expiry", type: "date" }, { key: "fields.qcStatus", label: "QC" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("product", "Product", "ref", { refEntity: "products", required: true }), f("qty", "Quantity", "number"), f("mfgDate", "Manufacture Date", "date"), f("expiry", "Expiry Date", "date"), f("qcStatus", "QC Status", "select", { options: ["Pending", "Passed", "Failed"] }), f("location", "Location"), f("serials", "Serials", "textarea", { colSpan: 2 })],
  },
  {
    key: "stock_movements", label: "Stock Movements", singular: "Stock Movement", module: "inventory", moduleLabel: "Inventory", prefix: "SM",
    statuses: ["completed"],
    columns: [{ key: "code", label: "Ref", primary: true }, { key: "date", label: "Date", type: "date" }, { key: "fields.type", label: "Type" }, { key: "fields.product", label: "Product" }, { key: "fields.qty", label: "Qty", type: "number", align: "right" }, { key: "fields.warehouse", label: "Warehouse" }, { key: "fields.reference", label: "Document" }],
    fields: [f("type", "Movement Type", "select", { options: ["Receipt", "Issue", "Transfer In", "Transfer Out", "Adjustment", "Production Receipt", "Dispatch", "Put Away"], required: true }), f("product", "Product", "ref", { refEntity: "products", required: true }), f("qty", "Quantity (+/-)", "number", { required: true }), f("warehouse", "Warehouse", "ref", { refEntity: "warehouses" }), f("reference", "Document Reference")],
  },
  {
    key: "stock_adjustments", label: "Stock Adjustments", singular: "Stock Adjustment", module: "inventory", moduleLabel: "Inventory", prefix: "ADJ",
    documentType: "Stock Adjustment", department: "Warehouse", statuses: S.doc, lines: "items",
    columns: [{ key: "code", label: "Adjustment", primary: true }, { key: "date", label: "Date", type: "date" }, { key: "fields.warehouse", label: "Warehouse" }, { key: "fields.reason", label: "Reason" }, { key: "fields.varianceValue", label: "Variance", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true }), f("reason", "Reason", "textarea", { required: true, colSpan: 2 }), f("countRef", "Count Reference")],
  },
  {
    key: "warehouse_item_plans", label: "Warehouse Item Planning", singular: "Warehouse Plan", module: "inventory", moduleLabel: "Inventory", prefix: "WHP",
    statuses: S.master,
    columns: [
      { key: "fields.product", label: "Product", primary: true }, { key: "fields.warehouse", label: "Warehouse" },
      { key: "fields.moq", label: "MOQ", type: "number", align: "right" }, { key: "fields.reorderLevel", label: "Reorder", type: "number", align: "right" },
      { key: "fields.reorderQuantity", label: "Reorder Qty", type: "number", align: "right" }, { key: "fields.maxStock", label: "Max", type: "number", align: "right" },
      { key: "fields.preferredSupplier", label: "Supplier" },
    ],
    fields: [
      f("product", "Product", "ref", { refEntity: "products", required: true, section: "Item" }),
      f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true, section: "Item" }),
      f("moq", "MOQ", "number", { section: "Thresholds" }),
      f("reorderLevel", "Reorder Level", "number", { section: "Thresholds" }),
      f("reorderQuantity", "Reorder Quantity", "number", { section: "Thresholds" }),
      f("safetyStock", "Safety Stock", "number", { section: "Thresholds" }),
      f("maxStock", "Max Stock", "number", { section: "Thresholds" }),
      f("leadTimeDays", "Lead Time (days)", "number", { section: "Thresholds" }),
      f("preferredSupplier", "Preferred Supplier", "ref", { refEntity: "suppliers", section: "Sourcing" }),
    ],
  },
  {
    key: "warehouses", label: "Warehouses", singular: "Warehouse", module: "warehouse", moduleLabel: "Warehouse", prefix: "WH",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Warehouse" }, { key: "fields.location", label: "Location" }, { key: "fields.keeper", label: "Keeper" }, { key: "fields.utilization", label: "Utilization %", type: "percent", align: "right" }],
    fields: [f("name", "Warehouse Name", "text", { required: true }), f("location", "Location"), f("keeper", "Store Keeper"), f("zones", "Zones", "number")],
  },
  {
    key: "bins", label: "Bins & Locations", singular: "Bin", module: "warehouse", moduleLabel: "Warehouse", prefix: "BIN",
    statuses: S.master,
    columns: [{ key: "code", label: "Bin", primary: true }, { key: "fields.warehouse", label: "Warehouse" }, { key: "fields.zone", label: "Zone" }, { key: "fields.capacity", label: "Capacity", type: "number", align: "right" }, { key: "fields.occupied", label: "Occupied", type: "number", align: "right" }, { key: "fields.product", label: "Product" }],
    fields: [f("name", "Bin Code", "text", { required: true }), f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true }), f("zone", "Zone"), f("rack", "Rack"), f("capacity", "Capacity", "number"), f("occupied", "Occupied", "number"), f("product", "Product", "ref", { refEntity: "products" })],
  },
  {
    key: "stock_transfers", label: "Stock Transfers", singular: "Stock Transfer", module: "warehouse", moduleLabel: "Warehouse", prefix: "TR",
    documentType: "Stock Transfer", department: "Warehouse", statuses: ["draft", "pending_approval", "approved", "in_progress", "completed", "cancelled"], lines: "items",
    workflow: ["draft", "pending_approval", "approved", "in_progress", "completed"],
    columns: [{ key: "code", label: "Transfer", primary: true }, { key: "fields.source", label: "From" }, { key: "fields.destination", label: "To" }, { key: "date", label: "Date", type: "date" }, { key: "fields.stage", label: "Stage" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("source", "Source Warehouse", "ref", { refEntity: "warehouses", required: true }), f("destination", "Destination", "text", { required: true }), f("destWarehouse", "Dest. Warehouse", "ref", { refEntity: "warehouses" }), f("vehicle", "Vehicle"), f("requestedBy", "Requested By"), f("stage", "Stage", "select", { options: ["Requested", "Dispatched", "In Transit", "Received"] })],
  },
  {
    key: "bin_transfers", label: "Bin Transfers", singular: "Bin Transfer", module: "warehouse", moduleLabel: "Warehouse", prefix: "BT",
    statuses: S.flow,
    columns: [{ key: "code", label: "Movement", primary: true }, { key: "fields.sourceBin", label: "From Bin" }, { key: "fields.destinationBin", label: "To Bin" }, { key: "fields.product", label: "Product" }, { key: "fields.qty", label: "Qty", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true }), f("sourceBin", "Source Bin", "ref", { refEntity: "bins", required: true }), f("destinationBin", "Destination Bin", "ref", { refEntity: "bins", required: true }), f("product", "Product", "ref", { refEntity: "products", required: true }), f("qty", "Quantity", "number", { required: true })],
  },
  {
    key: "stock_counts", label: "Stock Counts", singular: "Stock Count", module: "warehouse", moduleLabel: "Warehouse", prefix: "CNT",
    statuses: S.flow, lines: "items",
    columns: [{ key: "code", label: "Count", primary: true }, { key: "fields.warehouse", label: "Warehouse" }, { key: "fields.zone", label: "Zone" }, { key: "fields.variances", label: "Variances", type: "number", align: "right" }, { key: "fields.varianceValue", label: "Value", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("warehouse", "Warehouse", "ref", { refEntity: "warehouses", required: true }), f("zone", "Zone"), f("countedBy", "Counted By"), f("itemsCounted", "Items Counted", "number"), f("variances", "Variances", "number"), f("varianceValue", "Variance Value", "currency"), f("adjustment", "Variance Adjustment", "ref", { refEntity: "stock_adjustments" })],
  },
  {
    key: "quarantine", label: "Quarantine", singular: "Quarantine Hold", module: "quality-control", moduleLabel: "Quality", prefix: "QRN",
    statuses: ["hold", "released", "cancelled"],
    columns: [{ key: "code", label: "Hold", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.batch", label: "Batch" }, { key: "fields.qty", label: "Qty", type: "number", align: "right" }, { key: "fields.reason", label: "Reason" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("product", "Product", "ref", { refEntity: "products", required: true }), f("batch", "Batch", "ref", { refEntity: "batches" }), f("qty", "Quantity", "number"), f("source", "Source", "select", { options: ["Incoming QC", "In-Process QC", "Final QC", "Sales Return"] }), f("reason", "Reason", "textarea", { colSpan: 2 }), f("warehouse", "Warehouse", "ref", { refEntity: "warehouses" })],
  },

  /* ---------- Production ---------- */
  {
    key: "boms", label: "Bills of Material", singular: "BOM", module: "production", moduleLabel: "Production", prefix: "BOM",
    documentType: "BOM", department: "Production", statuses: S.doc, lines: "items",
    columns: [{ key: "code", label: "BOM", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.version", label: "Version" }, { key: "fields.outputQty", label: "Output Qty", type: "number", align: "right" }, { key: "fields.unitCost", label: "Unit Cost", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("product", "Product", "ref", { refEntity: "products", required: true }), f("version", "Version", "text", { required: true }), f("effectiveFrom", "Effective From", "date"), f("previousVersion", "Previous Version", "ref", { refEntity: "boms" }), f("outputQty", "Output Quantity", "number"), f("unitCost", "Unit Cost", "currency"), f("approvedBy", "Approved By")],
  },
  {
    key: "production_plans", label: "Production Plans", singular: "Production Plan", module: "production", moduleLabel: "Production", prefix: "PP",
    documentType: "Production Plan", department: "Production", statuses: S.doc, lines: "items",
    columns: [{ key: "code", label: "Plan", primary: true }, { key: "title", label: "Plan" }, { key: "fields.period", label: "Period" }, { key: "fields.strategy", label: "Strategy" }, { key: "fields.totalPlannedQty", label: "Planned Qty", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Plan Name", "text", { required: true }), f("period", "Period (YYYY-MM)", "text", { required: true }), f("version", "Version"), f("planner", "Planner"), f("strategy", "Strategy", "select", { options: ["Make to Stock", "Make to Order"] }), f("previousVersion", "Previous Version", "ref", { refEntity: "production_plans" })],
  },
  {
    key: "mrp_runs", label: "MRP Runs", singular: "MRP Run", module: "production", moduleLabel: "Production", prefix: "MRP",
    statuses: S.flow,
    columns: [{ key: "code", label: "Run", primary: true }, { key: "fields.plan", label: "Plan" }, { key: "fields.period", label: "Period" }, { key: "fields.suggestions", label: "Suggestions", type: "number", align: "right" }, { key: "fields.converted", label: "Converted", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("plan", "Production Plan", "ref", { refEntity: "production_plans", required: true }), f("period", "Planning Period"), f("warehouse", "Warehouse", "ref", { refEntity: "warehouses" }), f("lotSizing", "Lot Sizing", "select", { options: ["Lot-for-Lot", "Fixed Quantity", "EOQ"] })],
  },
  {
    key: "work_orders", label: "Work Orders", singular: "Work Order", module: "production", moduleLabel: "Production", prefix: "WO",
    documentType: "Work Order", department: "Production",
    statuses: ["draft", "released", "in_progress", "completed", "closed", "cancelled"],
    workflow: ["draft", "released", "in_progress", "completed", "closed"],
    columns: [{ key: "code", label: "Work Order", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.plannedQty", label: "Planned", type: "number", align: "right" }, { key: "fields.producedQty", label: "Produced", type: "number", align: "right" }, { key: "fields.machine", label: "Machine" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("product", "Product", "ref", { refEntity: "products", required: true }), f("bom", "BOM", "ref", { refEntity: "boms", required: true }),
      f("plannedQty", "Planned Quantity", "number", { required: true }), f("machine", "Machine", "ref", { refEntity: "machines" }),
      f("supervisor", "Supervisor"), f("plan", "Production Plan", "ref", { refEntity: "production_plans" }),
      f("startDate", "Start Date", "date"), f("endDate", "End Date", "date"),
    ],
  },
  {
    key: "material_issues", label: "Material Issues", singular: "Material Issue", module: "production", moduleLabel: "Production", prefix: "MI",
    statuses: S.flow, lines: "items",
    columns: [{ key: "code", label: "Issue", primary: true }, { key: "fields.workOrder", label: "Work Order" }, { key: "date", label: "Date", type: "date" }, { key: "fields.warehouse", label: "Warehouse" }, { key: "fields.mode", label: "Mode" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("workOrder", "Work Order", "ref", { refEntity: "work_orders", required: true }), f("warehouse", "Warehouse", "ref", { refEntity: "warehouses" }), f("issuedBy", "Issued By"), f("mode", "Mode", "select", { options: ["Manual", "Backflush"] })],
  },
  {
    key: "operations", label: "Operations", singular: "Operation", module: "production", moduleLabel: "Production", prefix: "OP",
    statuses: ["draft", "in_progress", "hold", "completed"],
    columns: [{ key: "code", label: "Operation", primary: true }, { key: "fields.workOrder", label: "Work Order" }, { key: "fields.machine", label: "Machine" }, { key: "fields.operator", label: "Operator" }, { key: "fields.outputQty", label: "Output", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("workOrder", "Work Order", "ref", { refEntity: "work_orders", required: true }),
      f("workCentre", "Work Centre", "select", { options: ["Extrusion", "Printing", "Sealing", "Packing"] }),
      f("machine", "Machine", "ref", { refEntity: "machines" }), f("operator", "Operator", "ref", { refEntity: "employees" }),
      f("plannedHrs", "Planned Hours", "number"), f("actualHrs", "Actual Hours", "number"),
      f("outputQty", "Output Qty", "number"), f("scrap", "Scrap", "number"), f("rework", "Rework", "number"), f("downtimeMins", "Downtime (mins)", "number"),
      f("downtimeReason", "Downtime Reason", "select", { options: ["No material", "Breakdown", "Changeover", "Quality hold", "Power cut"] }),
    ],
  },
  {
    key: "machines", label: "Machines & Work Centres", singular: "Machine", module: "production", moduleLabel: "Production", prefix: "MC",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Machine" }, { key: "fields.workCentre", label: "Work Centre" }, { key: "fields.capacityPerHr", label: "Capacity/hr", type: "number", align: "right" }, { key: "fields.utilization", label: "Utilization %", type: "percent", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Machine Name", "text", { required: true }), f("workCentre", "Work Centre", "select", { options: ["Extrusion", "Printing", "Sealing", "Packing"] }), f("capacityPerHr", "Capacity per Hour", "number"), f("shift", "Shift", "select", { options: ["A", "B", "C"] }), f("lastMaintenance", "Last Maintenance", "date")],
  },
  {
    key: "machine_schedules", label: "Machine Schedules", singular: "Machine Schedule", module: "production", moduleLabel: "Production", prefix: "MS",
    statuses: ["draft", "released", "completed"],
    columns: [{ key: "code", label: "Schedule", primary: true }, { key: "fields.week", label: "Week" }, { key: "fields.planner", label: "Planner" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("week", "Week (YYYY-Www)", "text", { required: true }), f("planner", "Planner")],
  },

  /* ---------- Quality ---------- */
  {
    key: "quality_plans", label: "Quality Plans", singular: "Quality Plan", module: "quality-control", moduleLabel: "Quality", prefix: "QP",
    statuses: S.master,
    columns: [{ key: "code", label: "Plan", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.stage", label: "Stage" }, { key: "fields.sampleSize", label: "Sampling" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("product", "Product", "ref", { refEntity: "products", required: true }), f("stage", "Stage", "select", { options: ["Incoming", "In-Process", "Final"] }), f("sampleSize", "Sampling Plan"), f("parameters", "Parameters", "textarea", { colSpan: 2 })],
  },
  {
    key: "qc_inspections", label: "Inspections", singular: "Inspection", module: "quality-control", moduleLabel: "Quality", prefix: "QC",
    documentType: "QC Inspection", department: "Quality", statuses: ["draft", "submitted", "approved", "rejected", "hold"],
    columns: [{ key: "code", label: "Inspection", primary: true }, { key: "fields.stage", label: "Stage" }, { key: "fields.product", label: "Product" }, { key: "fields.batch", label: "Batch" }, { key: "fields.result", label: "Result" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("stage", "Stage", "select", { options: ["Incoming", "In-Process", "Final"], required: true }),
      f("reference", "Reference Document"), f("product", "Product", "ref", { refEntity: "products", required: true }),
      f("batch", "Batch", "ref", { refEntity: "batches" }), f("sampleSize", "Sample Size", "number"),
      f("defects", "Defects Found", "number"), f("result", "Result", "select", { options: ["Pass", "Fail"] }),
      f("inspector", "Inspector"), f("disposition", "Disposition", "select", { options: ["Release", "Hold", "Reject"] }),
      f("qualityPlan", "Quality Plan", "ref", { refEntity: "quality_plans" }),
      f("coa", "Certificate of Analysis", "ref", { refEntity: "certificates" }),
    ],
  },
  {
    key: "ncrs", label: "Non-Conformance (NCR)", singular: "NCR", module: "quality-control", moduleLabel: "Quality", prefix: "NCR",
    statuses: ["open", "in_progress", "closed", "cancelled"],
    columns: [{ key: "code", label: "NCR", primary: true }, { key: "title", label: "Problem" }, { key: "fields.severity", label: "Severity" }, { key: "fields.source", label: "Source" }, { key: "fields.disposition", label: "Disposition" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Problem Title", "text", { required: true }),
      f("source", "Source", "select", { options: ["Inspection", "Production", "Customer Complaint", "Audit"], required: true }),
      f("reference", "Reference"), f("severity", "Severity", "select", { options: ["Minor", "Major", "Critical"], required: true }),
      f("product", "Product", "ref", { refEntity: "products" }), f("batch", "Batch", "ref", { refEntity: "batches" }),
      f("problem", "Problem Description", "textarea", { colSpan: 2, required: true }),
      f("rootCause", "Root Cause", "textarea", { colSpan: 2 }),
      f("disposition", "Disposition", "select", { options: ["Use as-is", "Rework", "Regrade", "Reject", "Return to Vendor"] }),
      f("costImpact", "Cost Impact", "currency"), f("capa", "Linked CAPA", "ref", { refEntity: "capas" }), f("raisedBy", "Raised By"),
    ],
  },
  {
    key: "capas", label: "CAPA", singular: "CAPA", module: "quality-control", moduleLabel: "Quality", prefix: "CAPA",
    statuses: ["open", "in_progress", "completed", "closed"],
    columns: [{ key: "code", label: "CAPA", primary: true }, { key: "title", label: "Subject" }, { key: "fields.owner", label: "Owner" }, { key: "fields.stage", label: "Stage" }, { key: "fields.dueDate", label: "Due", type: "date" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Subject", "text", { required: true }), f("ncr", "Linked NCR", "ref", { refEntity: "ncrs" }),
      f("owner", "Owner", "text", { required: true }), f("dueDate", "Due Date", "date", { required: true }),
      f("stage", "Stage", "select", { options: ["Containment", "Root Cause", "Corrective Action", "Preventive Action", "Effectiveness", "Closure"] }),
      f("containment", "Containment", "textarea", { colSpan: 2 }), f("rootCause", "Root Cause", "textarea", { colSpan: 2 }),
      f("correctiveAction", "Corrective Action", "textarea", { colSpan: 2 }), f("preventiveAction", "Preventive Action", "textarea", { colSpan: 2 }),
      f("effectiveness", "Effectiveness Verification", "textarea", { colSpan: 2 }),
    ],
  },
  {
    key: "instruments", label: "Instruments & Calibration", singular: "Instrument", module: "quality-control", moduleLabel: "Quality", prefix: "INS",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Instrument" }, { key: "fields.location", label: "Location" }, { key: "fields.nextCalibration", label: "Next Calibration", type: "date" }, { key: "fields.status", label: "Calibration" }],
    fields: [f("name", "Instrument", "text", { required: true }), f("location", "Location"), f("lastCalibration", "Last Calibration", "date"), f("nextCalibration", "Next Calibration", "date")],
  },
  {
    key: "certificates", label: "Certificates of Analysis", singular: "CoA", module: "quality-control", moduleLabel: "Quality", prefix: "COA",
    statuses: ["draft", "completed"], printable: true,
    columns: [{ key: "code", label: "CoA", primary: true }, { key: "fields.product", label: "Product" }, { key: "fields.batch", label: "Batch" }, { key: "fields.inspection", label: "Inspection" }, { key: "fields.standard", label: "Standard" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Title", "text", { required: true }), f("inspection", "Inspection", "ref", { refEntity: "qc_inspections", required: true }),
      f("product", "Product", "ref", { refEntity: "products" }), f("batch", "Batch", "ref", { refEntity: "batches" }),
      f("result", "Result", "select", { options: ["Pass", "Fail"] }), f("standard", "Standard"),
      f("issuedTo", "Issued To"), f("issuedBy", "Issued By"),
    ],
  },

  /* ---------- HR ---------- */
  {
    key: "employees", label: "Employees", singular: "Employee", module: "hr", moduleLabel: "HR", prefix: "EMP",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Employee" }, { key: "fields.department", label: "Department" }, { key: "fields.designation", label: "Designation" }, { key: "fields.basicSalary", label: "Basic", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Full Name", "text", { required: true, section: "Identity" }),
      f("department", "Department", "ref", { refEntity: "departments", required: true, section: "Job" }),
      f("designation", "Designation", "text", { required: true, section: "Job" }),
      f("grade", "Grade", "select", { options: ["A", "B", "C", "D"], section: "Job" }),
      f("branch", "Branch", "ref", { refEntity: "branches", section: "Job" }),
      f("contract", "Contract Type", "select", { options: ["Permanent", "Contract", "Probation", "Intern"], section: "Job" }),
      f("joinDate", "Join Date", "date", { section: "Job" }),
      f("phone", "Phone", "phone", { section: "Contact" }), f("email", "Email", "email", { section: "Contact" }),
      f("basicSalary", "Basic Salary", "currency", { section: "Payroll" }),
      f("ssf", "SSF Enrolled", "switch", { section: "Payroll" }),
      f("skills", "Skills", "textarea", { section: "Development", colSpan: 2 }),
    ],
  },
  {
    key: "attendance", label: "Attendance", singular: "Attendance", module: "hr", moduleLabel: "HR", prefix: "ATT",
    statuses: ["draft", "completed", "pending_approval", "approved"],
    columns: [{ key: "code", label: "Ref", primary: true }, { key: "fields.employeeName", label: "Employee" }, { key: "date", label: "Date", type: "date" }, { key: "fields.checkIn", label: "In" }, { key: "fields.checkOut", label: "Out" }, { key: "fields.hours", label: "Hours", type: "number", align: "right" }, { key: "fields.overtime", label: "OT", type: "number", align: "right" }],
    fields: [f("employee", "Employee", "ref", { refEntity: "employees", required: true }), f("employeeName", "Employee Name"), f("shift", "Shift", "select", { options: ["A", "B", "C"] }), f("checkIn", "Check In"), f("checkOut", "Check Out"), f("hours", "Hours", "number"), f("overtime", "Overtime Hours", "number"), f("status", "Attendance Status", "select", { options: ["Present", "Absent", "Half Day", "Leave"] })],
  },
  {
    key: "leave_requests", label: "Leave Requests", singular: "Leave Request", module: "hr", moduleLabel: "HR", prefix: "LV",
    documentType: "Leave Request", department: "HR", statuses: S.doc,
    workflow: ["draft", "pending_approval", "approved"],
    columns: [{ key: "code", label: "Request", primary: true }, { key: "fields.employeeName", label: "Employee" }, { key: "fields.type", label: "Type" }, { key: "fields.from", label: "From", type: "date" }, { key: "fields.days", label: "Days", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("employee", "Employee", "ref", { refEntity: "employees", required: true }), f("employeeName", "Employee Name"),
      f("type", "Leave Type", "select", { options: ["Annual", "Sick", "Casual", "Unpaid", "Maternity"], required: true }),
      f("from", "From Date", "date", { required: true }), f("to", "To Date", "date", { required: true }),
      f("days", "Days", "number", { required: true }), f("reason", "Reason", "textarea", { colSpan: 2, required: true }),
    ],
  },
  {
    key: "payroll_runs", label: "Payroll Runs", singular: "Payroll Run", module: "hr", moduleLabel: "HR", prefix: "PAYRUN",
    documentType: "Payroll Run", department: "HR", statuses: ["draft", "in_progress", "pending_approval", "approved", "closed"],
    workflow: ["draft", "in_progress", "pending_approval", "approved", "closed"],
    columns: [{ key: "code", label: "Run", primary: true }, { key: "fields.period", label: "Period" }, { key: "fields.employees", label: "Employees", type: "number", align: "right" }, { key: "fields.gross", label: "Gross", type: "currency", align: "right" }, { key: "fields.net", label: "Net Pay", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("period", "Period (YYYY-MM)", "text", { required: true }), f("employees", "Employee Count", "number"), f("gross", "Gross", "currency"), f("ssf", "SSF", "currency"), f("tax", "Income Tax", "currency"), f("net", "Net Pay", "currency")],
  },
  {
    key: "payslips", label: "Payslips", singular: "Payslip", module: "hr", moduleLabel: "HR", prefix: "PS",
    statuses: ["draft", "completed"], printable: true,
    columns: [{ key: "code", label: "Payslip", primary: true }, { key: "fields.employeeName", label: "Employee" }, { key: "fields.period", label: "Period" }, { key: "fields.basic", label: "Basic", type: "currency", align: "right" }, { key: "fields.net", label: "Net Pay", type: "currency", align: "right" }],
    fields: [f("employee", "Employee", "ref", { refEntity: "employees", required: true }), f("period", "Period"), f("basic", "Basic", "currency"), f("allowances", "Allowances", "currency"), f("overtime", "Overtime", "currency"), f("ssf", "SSF", "currency"), f("cit", "CIT", "currency"), f("tax", "Income Tax", "currency"), f("net", "Net Pay", "currency")],
  },
  {
    key: "performance_reviews", label: "Performance", singular: "Performance Review", module: "hr", moduleLabel: "HR", prefix: "PERF",
    statuses: ["draft", "in_progress", "completed", "closed"],
    columns: [{ key: "code", label: "Review", primary: true }, { key: "fields.employeeName", label: "Employee" }, { key: "fields.cycle", label: "Cycle" }, { key: "fields.selfRating", label: "Self", type: "number", align: "right" }, { key: "fields.managerRating", label: "Manager", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("employee", "Employee", "ref", { refEntity: "employees", required: true }), f("employeeName", "Employee Name"),
      f("cycle", "Appraisal Cycle", "text", { required: true }), f("goals", "Goals / KPIs", "textarea", { colSpan: 2 }),
      f("competencies", "Competencies", "textarea", { colSpan: 2 }),
      f("selfRating", "Self Rating (1-5)", "number"), f("managerRating", "Manager Rating (1-5)", "number"),
      f("finalRating", "Final Rating (1-5)", "number"), f("trainingNeeds", "Training Needs", "textarea", { colSpan: 2 }), f("reviewer", "Reviewer"),
    ],
  },
  {
    key: "recruitment", label: "Recruitment", singular: "Requisition", module: "hr", moduleLabel: "HR", prefix: "REQ",
    statuses: ["open", "in_progress", "closed"],
    columns: [{ key: "code", label: "Requisition", primary: true }, { key: "title", label: "Position" }, { key: "fields.department", label: "Department" }, { key: "fields.positions", label: "Positions", type: "number", align: "right" }, { key: "fields.applicants", label: "Applicants", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Position", "text", { required: true }), f("department", "Department", "ref", { refEntity: "departments" }), f("positions", "Positions", "number"), f("applicants", "Applicants", "number"), f("stage", "Stage", "select", { options: ["Sourcing", "Screening", "Interview", "Offer", "Hired"] }), f("hiringManager", "Hiring Manager")],
  },

  /* ---------- Accounting ---------- */
  {
    key: "accounts", label: "Chart of Accounts", singular: "Account", module: "accounting", moduleLabel: "Accounting", prefix: "ACC",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Account" }, { key: "fields.group", label: "Group" }, { key: "fields.balance", label: "Balance", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Account Name", "text", { required: true }), f("group", "Account Group", "select", { options: ["Asset", "Liability", "Equity", "Income", "Expense"], required: true }), f("balance", "Opening Balance", "currency"), f("costCentre", "Cost Centre", "ref", { refEntity: "cost_centres" })],
  },
  {
    key: "vouchers", label: "Vouchers", singular: "Voucher", module: "accounting", moduleLabel: "Accounting", prefix: "JV",
    documentType: "Journal Voucher", department: "Accounts", statuses: S.post, lines: "ledger", printable: true,
    workflow: ["draft", "pending_approval", "posted"],
    columns: [{ key: "code", label: "Voucher", primary: true }, { key: "fields.type", label: "Type" }, { key: "date", label: "Date", type: "date" }, { key: "title", label: "Narration" }, { key: "total", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("type", "Voucher Type", "select", { options: ["Journal", "Payment", "Receipt", "Contra", "Adjustment"], required: true }),
      f("reference", "Reference Document"), f("branch", "Branch", "ref", { refEntity: "branches" }),
      f("narration", "Narration", "textarea", { colSpan: 2, required: true }),
    ],
  },
  {
    key: "expenses", label: "Expenses", singular: "Expense", module: "accounting", moduleLabel: "Accounting", prefix: "EXP",
    documentType: "Expense", department: "Accounts", statuses: S.doc,
    columns: [{ key: "code", label: "Expense", primary: true }, { key: "title", label: "Description" }, { key: "fields.category", label: "Category" }, { key: "date", label: "Date", type: "date" }, { key: "fields.amount", label: "Amount", type: "currency", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Description", "text", { required: true }), f("category", "Category", "select", { options: ["Utilities", "Freight & Transport", "Repairs", "Travel", "Office", "Marketing"] }), f("account", "GL Account", "ref", { refEntity: "accounts" }), f("amount", "Amount", "currency", { required: true }), f("paidBy", "Paid By"), f("branch", "Branch", "ref", { refEntity: "branches" })],
  },
  {
    key: "cost_centres", label: "Cost Centres", singular: "Cost Centre", module: "accounting", moduleLabel: "Accounting", prefix: "CC",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Cost Centre" }, { key: "fields.manager", label: "Manager" }, { key: "fields.budget", label: "Budget", type: "currency", align: "right" }, { key: "fields.actual", label: "Actual", type: "currency", align: "right" }],
    fields: [f("name", "Cost Centre", "text", { required: true }), f("manager", "Manager"), f("budget", "Budget", "currency"), f("actual", "Actual", "currency")],
  },
  {
    key: "assets", label: "Fixed Assets", singular: "Asset", module: "accounting", moduleLabel: "Accounting", prefix: "AST",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Asset" }, { key: "fields.category", label: "Category" }, { key: "fields.cost", label: "Cost", type: "currency", align: "right" }, { key: "fields.wdv", label: "WDV", type: "currency", align: "right" }],
    fields: [f("name", "Asset Name", "text", { required: true }), f("category", "Category", "select", { options: ["Plant & Machinery", "Vehicles", "Furniture", "IT Equipment", "Building"] }), f("cost", "Acquisition Cost", "currency"), f("depreciationPct", "Depreciation %", "number"), f("wdv", "Written Down Value", "currency"), f("location", "Location")],
  },

  /* ---------- Administration & platform ---------- */
  {
    key: "branches", label: "Branches", singular: "Branch", module: "settings", moduleLabel: "Administration", prefix: "BR",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Branch" }, { key: "fields.address", label: "Address" }, { key: "fields.manager", label: "Manager" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Branch Name", "text", { required: true }), f("address", "Address"), f("manager", "Manager"), f("pan", "PAN")],
  },
  {
    key: "departments", label: "Departments", singular: "Department", module: "settings", moduleLabel: "Administration", prefix: "DEP",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Department" }, { key: "fields.head", label: "Head" }, { key: "fields.headcount", label: "Headcount", type: "number", align: "right" }],
    fields: [f("name", "Department", "text", { required: true }), f("head", "Department Head"), f("headcount", "Headcount", "number")],
  },
  {
    key: "workflow_rules", label: "Workflow Automation", singular: "Workflow Rule", module: "settings", moduleLabel: "Administration", prefix: "WF",
    statuses: S.master,
    columns: [{ key: "code", label: "Rule", primary: true }, { key: "title", label: "Name" }, { key: "fields.trigger", label: "Trigger" }, { key: "fields.action", label: "Action" }, { key: "fields.recipient", label: "Recipient" }, { key: "status", label: "Status", type: "status" }],
    fields: [
      f("name", "Rule Name", "text", { required: true }),
      f("trigger", "Trigger", "select", { options: ["Stock below reorder level", "Invoice overdue", "Purchase order above threshold", "Leave request created", "QC failed", "Record approved"], required: true }),
      f("condition", "Condition", "textarea", { colSpan: 2 }),
      f("action", "Action", "select", { options: ["Create alert + notify", "Notify + create task", "Start approval workflow", "Send WhatsApp", "Send email"], required: true }),
      f("recipient", "Recipient", "text", { required: true }),
      f("schedule", "Schedule", "select", { options: ["Realtime", "Hourly", "Daily 09:00", "Weekly Monday"] }),
    ],
  },
  {
    key: "whatsapp_templates", label: "WhatsApp Templates", singular: "Template", module: "settings", moduleLabel: "Administration", prefix: "WA",
    statuses: S.master,
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Template" }, { key: "fields.category", label: "Category" }, { key: "fields.sent", label: "Sent", type: "number", align: "right" }, { key: "fields.delivered", label: "Delivered", type: "number", align: "right" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Template Name", "text", { required: true }), f("category", "Category", "select", { options: ["Sales", "Accounts", "Logistics", "HR"] }), f("variables", "Variables"), f("body", "Message Body", "textarea", { colSpan: 2, required: true })],
  },
  {
    key: "rfid_tags", label: "RFID Tags", singular: "RFID Tag", module: "settings", moduleLabel: "Administration", prefix: "TAG",
    statuses: S.master,
    columns: [{ key: "code", label: "Tag", primary: true }, { key: "title", label: "Description" }, { key: "fields.reader", label: "Reader" }, { key: "fields.assignedTo", label: "Assigned To" }, { key: "fields.location", label: "Location" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Description", "text", { required: true }), f("reader", "Reader"), f("assignedTo", "Assigned To"), f("location", "Location")],
  },
  {
    key: "iot_sensors", label: "IoT Sensors", singular: "Sensor", module: "settings", moduleLabel: "Administration", prefix: "SEN",
    statuses: S.master,
    columns: [{ key: "code", label: "Sensor", primary: true }, { key: "title", label: "Description" }, { key: "fields.machine", label: "Machine" }, { key: "fields.value", label: "Value", type: "number", align: "right" }, { key: "fields.health", label: "Health" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("name", "Description", "text", { required: true }), f("machine", "Machine", "ref", { refEntity: "machines" }), f("metric", "Metric", "select", { options: ["Temperature", "Pressure", "Vibration", "Runtime"] }), f("value", "Current Value", "number"), f("threshold", "Threshold", "number")],
  },
  {
    key: "backups", label: "Backups", singular: "Backup", module: "settings", moduleLabel: "Administration", prefix: "BKP",
    statuses: ["in_progress", "completed", "rejected"],
    columns: [{ key: "code", label: "Backup", primary: true }, { key: "date", label: "Date", type: "date" }, { key: "fields.type", label: "Type" }, { key: "fields.size", label: "Size" }, { key: "fields.retention", label: "Retention" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("type", "Type", "select", { options: ["Automatic", "Manual"] }), f("size", "Size"), f("retention", "Retention"), f("storage", "Storage")],
  },
  {
    key: "insights", label: "Governed insights", singular: "Insight", module: "settings", moduleLabel: "Administration", prefix: "INSIGHT",
    statuses: ["draft", "approved", "rejected"],
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Insight" }, { key: "fields.kind", label: "Kind" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("kind", "Kind"), f("prompt", "Prompt", "textarea", { colSpan: 2 }), f("body", "Body", "textarea", { colSpan: 2 }), f("redacted", "Redacted", "switch")],
  },
  {
    key: "saved_reports", label: "Saved reports", singular: "Saved report", module: "settings", moduleLabel: "Administration", prefix: "RPT",
    statuses: ["draft", "completed"],
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Report" }, { key: "fields.entity", label: "Source" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("entity", "Source entity"), f("body", "Summary", "textarea", { colSpan: 2 })],
  },
  {
    key: "outbound_mail", label: "Outbound mail", singular: "Mail", module: "settings", moduleLabel: "Administration", prefix: "MAIL",
    statuses: ["draft", "in_progress", "completed", "rejected"],
    columns: [{ key: "code", label: "Code", primary: true }, { key: "title", label: "Subject" }, { key: "fields.to", label: "To" }, { key: "fields.schedule", label: "Schedule" }, { key: "status", label: "Status", type: "status" }],
    fields: [f("from", "From"), f("to", "To"), f("cc", "Cc"), f("subject", "Subject"), f("schedule", "Schedule", "select", { options: ["once", "weekly"] }), f("note", "Note", "textarea", { colSpan: 2 })],
  },
];

export const ENTITY_MAP: Record<string, EntityDef> = Object.fromEntries(ENTITIES.map((e) => [e.key, e]));
export const getEntity = (key: string): EntityDef | undefined => ENTITY_MAP[key];
export const entitiesByModule = (module: string) => ENTITIES.filter((e) => e.module === module);
