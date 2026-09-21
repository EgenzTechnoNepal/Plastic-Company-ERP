import type { FieldOption, FormDefinition } from "./types";

const opts = (...values: string[]): FieldOption[] =>
  values.map((v) => ({
    value: v,
    label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

export const FORM_DEFINITIONS: Record<string, FormDefinition> = {
  customer: {
    key: "customer",
    title: "New Customer",
    description: "Master record used across CRM, sales, dispatch and receivables.",
    submitLabel: "Save customer",
    endpoint: "POST /api/v1/crm/customers/",
    roles: ["manager", "sales"],
    sections: [
      {
        title: "Identity",
        fields: [
          { name: "code", label: "Customer code", type: "text", placeholder: "CUS-0001", required: true },
          { name: "name", label: "Business name", type: "text", placeholder: "Everest Mart Pvt. Ltd.", required: true },
          { name: "type", label: "Customer type", type: "select", options: opts("distributor", "retailer", "corporate", "government"), required: true },
          { name: "pan", label: "PAN / VAT no.", type: "text", placeholder: "601234567" },
        ],
      },
      {
        title: "Contact",
        fields: [
          { name: "contact", label: "Contact person", type: "text", required: true },
          { name: "phone", label: "Phone", type: "tel", placeholder: "+977-98…", required: true },
          { name: "email", label: "Email", type: "email", placeholder: "name@company.com" },
          { name: "city", label: "City", type: "text", placeholder: "Itahari" },
          { name: "address", label: "Billing address", type: "textarea", colSpan: 2 },
        ],
      },
      {
        title: "Commercial terms",
        fields: [
          { name: "creditLimit", label: "Credit limit", type: "currency", min: 0 },
          { name: "creditDays", label: "Credit days", type: "number", min: 0, max: 180 },
          { name: "priceList", label: "Price list", type: "select", options: opts("standard", "distributor", "export") },
          { name: "active", label: "Active", type: "switch", defaultValue: true },
        ],
      },
    ],
  },

  lead: {
    key: "lead",
    title: "New Lead",
    description: "Capture an enquiry and place it on the pipeline.",
    submitLabel: "Save lead",
    endpoint: "POST /api/v1/crm/leads/",
    sections: [
      {
        title: "Lead details",
        fields: [
          { name: "company", label: "Company", type: "text", required: true },
          { name: "contact", label: "Contact person", type: "text", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "email", label: "Email", type: "email" },
          { name: "source", label: "Source", type: "select", options: opts("referral", "website", "cold_call", "trade_show", "social"), required: true },
          { name: "stage", label: "Stage", type: "select", options: opts("new", "contacted", "qualified", "proposal", "won", "lost"), defaultValue: "new" },
          { name: "value", label: "Estimated value", type: "currency", min: 0 },
          { name: "owner", label: "Assigned to", type: "text" },
          { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  quotation: {
    key: "quotation",
    title: "New Quotation",
    description: "Priced offer that can be converted to a sales order in one click.",
    submitLabel: "Create quotation",
    endpoint: "POST /api/v1/crm/quotations/",
    sections: [
      {
        title: "Header",
        fields: [
          { name: "number", label: "Quotation no.", type: "text", placeholder: "QT-2081-015", required: true },
          { name: "customer", label: "Customer", type: "text", required: true },
          { name: "date", label: "Quotation date", type: "date", required: true },
          { name: "validTill", label: "Valid till", type: "date" },
        ],
      },
      {
        title: "Values",
        fields: [
          { name: "items", label: "Line items", type: "number", min: 1, defaultValue: 1 },
          { name: "amount", label: "Net amount", type: "currency", min: 0, required: true },
          { name: "tax", label: "Tax", type: "select", options: opts("vat_13", "vat_exempt") },
          { name: "status", label: "Status", type: "select", options: opts("draft", "sent", "accepted", "rejected", "expired"), defaultValue: "draft" },
          { name: "terms", label: "Terms & conditions", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  salesOrder: {
    key: "salesOrder",
    title: "New Sales Order",
    description: "Confirmed customer order; credit and stock checks run on release.",
    submitLabel: "Create order",
    endpoint: "POST /api/v1/sales/orders/",
    sections: [
      {
        title: "Order",
        fields: [
          { name: "number", label: "Order no.", type: "text", placeholder: "SO-2081-048", required: true },
          { name: "customer", label: "Customer", type: "text", required: true },
          { name: "date", label: "Order date", type: "date", required: true },
          { name: "deliveryDate", label: "Delivery due", type: "date", required: true },
          { name: "warehouse", label: "Dispatch warehouse", type: "select", options: opts("main", "production_store") },
          { name: "priority", label: "Priority", type: "select", options: opts("normal", "urgent") },
        ],
      },
      {
        title: "Amounts",
        fields: [
          { name: "items", label: "Line items", type: "number", min: 1, defaultValue: 1 },
          { name: "amount", label: "Order value", type: "currency", min: 0, required: true },
          { name: "advance", label: "Advance received", type: "currency", min: 0 },
          { name: "remarks", label: "Remarks", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  invoice: {
    key: "invoice",
    title: "New Sales Invoice",
    description: "VAT invoice; transmitted to IRD/CBMS by the backend on posting.",
    submitLabel: "Create invoice",
    endpoint: "POST /api/v1/sales/invoices/",
    sections: [
      {
        title: "Invoice",
        fields: [
          { name: "number", label: "Invoice no.", type: "text", required: true },
          { name: "customer", label: "Customer", type: "text", required: true },
          { name: "orderRef", label: "Against sales order", type: "text", placeholder: "SO-2081-047" },
          { name: "date", label: "Invoice date", type: "date", required: true },
          { name: "dueDate", label: "Payment due", type: "date" },
          { name: "amount", label: "Invoice amount", type: "currency", min: 0, required: true },
          { name: "vat", label: "VAT treatment", type: "select", options: opts("vat_13", "vat_exempt", "export") },
          { name: "status", label: "Status", type: "select", options: opts("unpaid", "partial", "paid"), defaultValue: "unpaid" },
        ],
      },
    ],
  },

  payment: {
    key: "payment",
    title: "Record Payment",
    description: "Receipt against a customer invoice.",
    submitLabel: "Record payment",
    endpoint: "POST /api/v1/sales/payments/",
    sections: [
      {
        title: "Receipt",
        fields: [
          { name: "customer", label: "Customer", type: "text", required: true },
          { name: "invoice", label: "Invoice no.", type: "text", required: true },
          { name: "date", label: "Received on", type: "date", required: true },
          { name: "amount", label: "Amount", type: "currency", min: 1, required: true },
          { name: "mode", label: "Mode", type: "select", options: opts("cash", "bank", "cheque", "esewa", "khalti"), required: true },
          { name: "reference", label: "Reference no.", type: "text" },
          { name: "note", label: "Note", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  salesReturn: {
    key: "salesReturn",
    title: "New Sales Return",
    description: "Customer return authorisation with reason code and credit note.",
    submitLabel: "Create return",
    endpoint: "POST /api/v1/sales/returns/",
    sections: [
      {
        title: "Return",
        fields: [
          { name: "number", label: "Return no.", type: "text", required: true },
          { name: "customer", label: "Customer", type: "text", required: true },
          { name: "invoice", label: "Original invoice", type: "text", required: true },
          { name: "date", label: "Return date", type: "date", required: true },
          { name: "batch", label: "Batch no.", type: "text" },
          { name: "qty", label: "Quantity", type: "number", min: 1, required: true },
          { name: "reason", label: "Reason code", type: "select", options: opts("damaged", "wrong_item", "quality_issue", "excess_supply", "expired"), required: true },
          { name: "disposition", label: "Disposition", type: "select", options: opts("restock", "quarantine", "scrap") },
          { name: "creditAmount", label: "Credit note amount", type: "currency", min: 0 },
          { name: "remarks", label: "Remarks", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  dealer: {
    key: "dealer",
    title: "New Dealer / Agent",
    description: "Channel partner with territory, commission and consignment stock.",
    submitLabel: "Save partner",
    endpoint: "POST /api/v1/crm/dealers/",
    sections: [
      {
        title: "Partner",
        fields: [
          { name: "code", label: "Partner code", type: "text", required: true },
          { name: "name", label: "Name", type: "text", required: true },
          { name: "kind", label: "Type", type: "select", options: opts("dealer", "agent", "distributor"), required: true },
          { name: "territory", label: "Territory", type: "text", placeholder: "Province 1" },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "email", label: "Email", type: "email" },
          { name: "commission", label: "Commission %", type: "number", min: 0, max: 100, step: 0.5 },
          { name: "target", label: "Monthly target", type: "currency", min: 0 },
        ],
      },
    ],
  },

  supplier: {
    key: "supplier",
    title: "New Supplier",
    description: "Vendor master used by procurement, GRN and payables.",
    submitLabel: "Save supplier",
    endpoint: "POST /api/v1/purchase/suppliers/",
    sections: [
      {
        title: "Vendor",
        fields: [
          { name: "code", label: "Supplier code", type: "text", required: true },
          { name: "name", label: "Supplier name", type: "text", required: true },
          { name: "type", label: "Supply type", type: "select", options: opts("raw_material", "packaging", "machinery", "service"), required: true },
          { name: "pan", label: "PAN / VAT no.", type: "text" },
          { name: "contact", label: "Contact person", type: "text" },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "email", label: "Email", type: "email" },
          { name: "city", label: "City", type: "text" },
          { name: "paymentTerms", label: "Payment terms", type: "select", options: opts("advance", "net_15", "net_30", "net_45") },
          { name: "rating", label: "Quality rating (1-5)", type: "number", min: 1, max: 5 },
        ],
      },
    ],
  },

  purchaseOrder: {
    key: "purchaseOrder",
    title: "New Purchase Order",
    description: "Raised manually or from an MRP-generated requisition.",
    submitLabel: "Create PO",
    endpoint: "POST /api/v1/purchase/orders/",
    sections: [
      {
        title: "Order",
        fields: [
          { name: "number", label: "PO no.", type: "text", required: true },
          { name: "supplier", label: "Supplier", type: "text", required: true },
          { name: "date", label: "PO date", type: "date", required: true },
          { name: "expected", label: "Expected delivery", type: "date", required: true },
          { name: "items", label: "Line items", type: "number", min: 1, defaultValue: 1 },
          { name: "amount", label: "PO value", type: "currency", min: 0, required: true },
          { name: "terms", label: "Terms", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  goodsReceipt: {
    key: "goodsReceipt",
    title: "New Goods Receipt",
    description: "GRN with batch capture and incoming inspection hook.",
    submitLabel: "Post GRN",
    endpoint: "POST /api/v1/purchase/receipts/",
    sections: [
      {
        title: "Receipt",
        fields: [
          { name: "number", label: "GRN no.", type: "text", required: true },
          { name: "po", label: "Against PO", type: "text", required: true },
          { name: "supplier", label: "Supplier", type: "text", required: true },
          { name: "date", label: "Received on", type: "date", required: true },
          { name: "item", label: "Item", type: "text", required: true },
          { name: "batch", label: "Batch no.", type: "text", required: true },
          { name: "qty", label: "Quantity received", type: "number", min: 1, required: true },
          { name: "uom", label: "UOM", type: "select", options: opts("kg", "pcs", "roll", "ctn") },
          { name: "warehouse", label: "Put-away location", type: "text", placeholder: "A-02" },
          { name: "qcStatus", label: "QC status", type: "select", options: opts("pending", "accepted", "rejected"), defaultValue: "pending" },
        ],
      },
    ],
  },

  purchaseReturn: {
    key: "purchaseReturn",
    title: "New Purchase Return",
    description: "Return-to-vendor with debit note and vendor scorecard update.",
    submitLabel: "Create return",
    endpoint: "POST /api/v1/purchase/returns/",
    sections: [
      {
        title: "Return",
        fields: [
          { name: "number", label: "Return no.", type: "text", required: true },
          { name: "supplier", label: "Supplier", type: "text", required: true },
          { name: "grn", label: "Against GRN", type: "text", required: true },
          { name: "date", label: "Return date", type: "date", required: true },
          { name: "item", label: "Item", type: "text", required: true },
          { name: "batch", label: "Batch no.", type: "text" },
          { name: "qty", label: "Quantity", type: "number", min: 1, required: true },
          { name: "reason", label: "Reason", type: "select", options: opts("quality_reject", "short_supply", "wrong_item", "damaged_in_transit"), required: true },
          { name: "debitAmount", label: "Debit note amount", type: "currency", min: 0 },
          { name: "remarks", label: "Remarks", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  product: {
    key: "product",
    title: "New Product",
    description: "Item master with UOM, valuation and reorder policy.",
    submitLabel: "Save product",
    endpoint: "POST /api/v1/inventory/products/",
    sections: [
      {
        title: "Identification",
        fields: [
          { name: "sku", label: "SKU", type: "text", required: true },
          { name: "name", label: "Product name", type: "text", required: true },
          { name: "type", label: "Item type", type: "select", options: opts("raw_material", "semi_finished", "finished_goods", "packaging"), required: true },
          { name: "category", label: "Category", type: "text" },
          { name: "barcode", label: "Barcode", type: "text" },
          { name: "uom", label: "Base UOM", type: "select", options: opts("kg", "pcs", "roll", "ctn", "m"), required: true },
        ],
      },
      {
        title: "Stock policy",
        fields: [
          { name: "openingStock", label: "Opening stock", type: "number", min: 0 },
          { name: "reorderLevel", label: "Reorder level", type: "number", min: 0 },
          { name: "safetyStock", label: "Safety stock", type: "number", min: 0 },
          { name: "moq", label: "Minimum order qty", type: "number", min: 0 },
          { name: "rate", label: "Standard rate", type: "currency", min: 0 },
          { name: "valuation", label: "Valuation method", type: "select", options: opts("fifo", "weighted_average", "standard_cost") },
          { name: "batchTracked", label: "Batch tracked", type: "switch", defaultValue: true },
          { name: "active", label: "Active", type: "switch", defaultValue: true },
        ],
      },
    ],
  },

  stockMovement: {
    key: "stockMovement",
    title: "New Stock Movement",
    description: "Stock in, out, transfer or adjustment with document reference.",
    submitLabel: "Post movement",
    endpoint: "POST /api/v1/inventory/movements/",
    sections: [
      {
        title: "Movement",
        fields: [
          { name: "kind", label: "Movement type", type: "select", options: opts("in", "out", "transfer", "adjustment"), required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "item", label: "Item", type: "text", required: true },
          { name: "batch", label: "Batch no.", type: "text" },
          { name: "qty", label: "Quantity", type: "number", required: true },
          { name: "uom", label: "UOM", type: "select", options: opts("kg", "pcs", "roll", "ctn") },
          { name: "fromLocation", label: "From location", type: "text" },
          { name: "toLocation", label: "To location", type: "text" },
          { name: "reference", label: "Document ref.", type: "text", placeholder: "GRN-2081-032" },
          { name: "reason", label: "Reason", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  warehouseLocation: {
    key: "warehouseLocation",
    title: "New Location / Bin",
    description: "Warehouse structure down to rack and bin.",
    submitLabel: "Save location",
    endpoint: "POST /api/v1/warehouse/locations/",
    sections: [
      {
        title: "Location",
        fields: [
          { name: "code", label: "Bin code", type: "text", placeholder: "A-02", required: true },
          { name: "warehouse", label: "Warehouse", type: "select", options: opts("main", "production_store", "quarantine"), required: true },
          { name: "zone", label: "Zone", type: "text" },
          { name: "capacity", label: "Capacity", type: "number", min: 0 },
          { name: "uom", label: "Capacity UOM", type: "select", options: opts("kg", "pcs", "ctn") },
          { name: "keeper", label: "Store keeper", type: "text" },
          { name: "blocked", label: "Blocked for dispatch", type: "switch" },
        ],
      },
    ],
  },

  bom: {
    key: "bom",
    title: "New Bill of Materials",
    description: "Versioned BOM with scrap and yield per component.",
    submitLabel: "Save BOM",
    endpoint: "POST /api/v1/production/boms/",
    sections: [
      {
        title: "Header",
        fields: [
          { name: "code", label: "BOM code", type: "text", required: true },
          { name: "product", label: "Finished product", type: "text", required: true },
          { name: "version", label: "Version", type: "text", placeholder: "v1.0", required: true },
          { name: "effectiveFrom", label: "Effective from", type: "date", required: true },
          { name: "outputQty", label: "Output quantity", type: "number", min: 1, required: true },
          { name: "uom", label: "Output UOM", type: "select", options: opts("kg", "pcs", "roll") },
          { name: "status", label: "Status", type: "select", options: opts("draft", "active", "obsolete"), defaultValue: "draft" },
          { name: "notes", label: "Notes", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  productionOrder: {
    key: "productionOrder",
    title: "New Production Order",
    description: "Work order against a BOM, line and shift.",
    submitLabel: "Create work order",
    endpoint: "POST /api/v1/production/orders/",
    sections: [
      {
        title: "Work order",
        fields: [
          { name: "number", label: "Order no.", type: "text", required: true },
          { name: "product", label: "Product", type: "text", required: true },
          { name: "bom", label: "BOM", type: "text", required: true },
          { name: "plannedQty", label: "Planned quantity", type: "number", min: 1, required: true },
          { name: "startDate", label: "Start date", type: "date", required: true },
          { name: "dueDate", label: "Due date", type: "date", required: true },
          { name: "line", label: "Production line", type: "select", options: opts("line_a", "line_b", "line_c") },
          { name: "shift", label: "Shift", type: "select", options: opts("morning", "evening", "night") },
          { name: "supervisor", label: "Supervisor", type: "text" },
          { name: "priority", label: "Priority", type: "select", options: opts("normal", "urgent") },
        ],
      },
    ],
  },

  machineSchedule: {
    key: "machineSchedule",
    title: "Schedule Machine Slot",
    description: "Work-centre capacity booking with setup and run time.",
    submitLabel: "Save slot",
    endpoint: "POST /api/v1/production/schedules/",
    sections: [
      {
        title: "Slot",
        fields: [
          { name: "machine", label: "Machine / work centre", type: "text", required: true },
          { name: "order", label: "Work order", type: "text", required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "shift", label: "Shift", type: "select", options: opts("morning", "evening", "night"), required: true },
          { name: "setupMins", label: "Setup time (min)", type: "number", min: 0 },
          { name: "runMins", label: "Run time (min)", type: "number", min: 0 },
          { name: "operator", label: "Operator", type: "text" },
          { name: "status", label: "Status", type: "select", options: opts("planned", "running", "completed", "maintenance") },
        ],
      },
    ],
  },

  qcInspection: {
    key: "qcInspection",
    title: "New Inspection",
    description: "Incoming, in-process or final inspection against a quality plan.",
    submitLabel: "Save inspection",
    endpoint: "POST /api/v1/quality/inspections/",
    sections: [
      {
        title: "Inspection",
        fields: [
          { name: "number", label: "Inspection no.", type: "text", required: true },
          { name: "stage", label: "Stage", type: "select", options: opts("incoming", "in_process", "final"), required: true },
          { name: "reference", label: "Reference document", type: "text", placeholder: "GRN-2081-032" },
          { name: "item", label: "Item", type: "text", required: true },
          { name: "batch", label: "Batch no.", type: "text", required: true },
          { name: "date", label: "Inspected on", type: "date", required: true },
          { name: "sampleSize", label: "Sample size", type: "number", min: 1 },
          { name: "defects", label: "Defects found", type: "number", min: 0 },
          { name: "result", label: "Result", type: "select", options: opts("pass", "fail", "conditional"), required: true },
          { name: "inspector", label: "Inspector", type: "text" },
          { name: "observation", label: "Observation", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  ncr: {
    key: "ncr",
    title: "New Non-Conformance Report",
    description: "Raised from inspection, production, complaint or audit.",
    submitLabel: "Raise NCR",
    endpoint: "POST /api/v1/quality/ncrs/",
    sections: [
      {
        title: "Non-conformance",
        fields: [
          { name: "number", label: "NCR no.", type: "text", required: true },
          { name: "source", label: "Source", type: "select", options: opts("inspection", "production", "customer_complaint", "audit"), required: true },
          { name: "date", label: "Raised on", type: "date", required: true },
          { name: "item", label: "Item / process", type: "text", required: true },
          { name: "batch", label: "Batch no.", type: "text" },
          { name: "severity", label: "Severity", type: "select", options: opts("minor", "major", "critical"), required: true },
          { name: "disposition", label: "Disposition", type: "select", options: opts("use_as_is", "rework", "regrade", "reject", "return_to_vendor") },
          { name: "cost", label: "Cost of non-conformance", type: "currency", min: 0 },
          { name: "description", label: "Description", type: "textarea", colSpan: 2, required: true },
        ],
      },
    ],
  },

  capa: {
    key: "capa",
    title: "New CAPA",
    description: "Corrective and preventive action with owner and verification.",
    submitLabel: "Create CAPA",
    endpoint: "POST /api/v1/quality/capas/",
    sections: [
      {
        title: "CAPA",
        fields: [
          { name: "number", label: "CAPA no.", type: "text", required: true },
          { name: "ncr", label: "Linked NCR", type: "text" },
          { name: "owner", label: "Owner", type: "text", required: true },
          { name: "openedOn", label: "Opened on", type: "date", required: true },
          { name: "dueOn", label: "Target closure", type: "date", required: true },
          { name: "stage", label: "Stage", type: "select", options: opts("containment", "root_cause", "corrective", "preventive", "verification", "closed"), required: true },
          { name: "problem", label: "Problem statement", type: "textarea", colSpan: 2, required: true },
          { name: "rootCause", label: "Root cause", type: "textarea", colSpan: 2 },
          { name: "action", label: "Action taken", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  employee: {
    key: "employee",
    title: "New Employee",
    description: "Employee master with department, grade and salary.",
    submitLabel: "Save employee",
    endpoint: "POST /api/v1/hr/employees/",
    sections: [
      {
        title: "Personal",
        fields: [
          { name: "code", label: "Employee code", type: "text", required: true },
          { name: "name", label: "Full name", type: "text", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "email", label: "Email", type: "email" },
          { name: "address", label: "Address", type: "textarea", colSpan: 2 },
        ],
      },
      {
        title: "Employment",
        fields: [
          { name: "department", label: "Department", type: "select", options: opts("production", "quality", "warehouse", "sales", "accounts", "hr", "maintenance"), required: true },
          { name: "designation", label: "Designation", type: "text", required: true },
          { name: "joinDate", label: "Joining date", type: "date", required: true },
          { name: "employmentType", label: "Employment type", type: "select", options: opts("permanent", "contract", "probation", "daily_wage") },
          { name: "shift", label: "Default shift", type: "select", options: opts("morning", "evening", "night", "general") },
          { name: "salary", label: "Monthly salary", type: "currency", min: 0, required: true },
          { name: "ssfNumber", label: "SSF number", type: "text" },
          { name: "bankAccount", label: "Bank account", type: "text" },
        ],
      },
    ],
  },

  leave: {
    key: "leave",
    title: "New Leave Request",
    description: "Application routed through the approval workflow.",
    submitLabel: "Submit request",
    endpoint: "POST /api/v1/hr/leaves/",
    sections: [
      {
        title: "Request",
        fields: [
          { name: "employee", label: "Employee", type: "text", required: true },
          { name: "type", label: "Leave type", type: "select", options: opts("annual", "sick", "casual", "unpaid", "maternity"), required: true },
          { name: "from", label: "From", type: "date", required: true },
          { name: "to", label: "To", type: "date", required: true },
          { name: "days", label: "Days", type: "number", min: 0.5, step: 0.5 },
          { name: "reason", label: "Reason", type: "textarea", colSpan: 2, required: true },
        ],
      },
    ],
  },

  payrollRun: {
    key: "payrollRun",
    title: "New Payroll Run",
    description: "Period payroll with attendance, overtime and statutory deductions.",
    submitLabel: "Generate payroll",
    endpoint: "POST /api/v1/hr/payroll-runs/",
    sections: [
      {
        title: "Run",
        fields: [
          { name: "period", label: "Payroll period", type: "text", placeholder: "2081-05", required: true },
          { name: "payDate", label: "Pay date", type: "date", required: true },
          { name: "department", label: "Department", type: "select", options: opts("all", "production", "quality", "warehouse", "sales", "accounts", "hr") },
          { name: "includeOvertime", label: "Include overtime", type: "switch", defaultValue: true },
          { name: "includeIncentive", label: "Include production incentive", type: "switch", defaultValue: true },
          { name: "remarks", label: "Remarks", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  voucher: {
    key: "voucher",
    title: "New Voucher",
    description: "Double-entry voucher posted to the general ledger.",
    submitLabel: "Post voucher",
    endpoint: "POST /api/v1/accounting/vouchers/",
    sections: [
      {
        title: "Voucher",
        fields: [
          { name: "number", label: "Voucher no.", type: "text", required: true },
          { name: "type", label: "Voucher type", type: "select", options: opts("receipt", "payment", "journal", "contra"), required: true },
          { name: "date", label: "Voucher date", type: "date", required: true },
          { name: "party", label: "Party / account", type: "text", required: true },
          { name: "debitAccount", label: "Debit account", type: "text", required: true },
          { name: "creditAccount", label: "Credit account", type: "text", required: true },
          { name: "amount", label: "Amount", type: "currency", min: 1, required: true },
          { name: "costCentre", label: "Cost centre", type: "text" },
          { name: "narration", label: "Narration", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  expense: {
    key: "expense",
    title: "New Expense",
    description: "Operating expense booked against a category and cost centre.",
    submitLabel: "Save expense",
    endpoint: "POST /api/v1/accounting/expenses/",
    sections: [
      {
        title: "Expense",
        fields: [
          { name: "date", label: "Date", type: "date", required: true },
          { name: "category", label: "Category", type: "select", options: opts("utilities", "transport", "maintenance", "salary", "marketing", "office", "other"), required: true },
          { name: "payee", label: "Paid to", type: "text", required: true },
          { name: "amount", label: "Amount", type: "currency", min: 1, required: true },
          { name: "mode", label: "Payment mode", type: "select", options: opts("cash", "bank", "cheque", "esewa") },
          { name: "reference", label: "Bill / reference no.", type: "text" },
          { name: "status", label: "Status", type: "select", options: opts("paid", "pending"), defaultValue: "paid" },
          { name: "note", label: "Note", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  ocrBill: {
    key: "ocrBill",
    title: "Scan Vendor Bill",
    description: "Upload a vendor bill; OCR extracts header and line values for review.",
    submitLabel: "Queue for OCR",
    endpoint: "POST /api/v1/purchase/ocr-bills/",
    sections: [
      {
        title: "Bill",
        fields: [
          { name: "supplier", label: "Supplier", type: "text", required: true },
          { name: "billNumber", label: "Bill no.", type: "text" },
          { name: "billDate", label: "Bill date", type: "date" },
          { name: "amount", label: "Bill amount", type: "currency", min: 0 },
          { name: "po", label: "Match against PO", type: "text" },
          { name: "source", label: "Capture source", type: "select", options: opts("scanner", "mobile_camera", "email_inbox", "upload"), required: true },
          { name: "note", label: "Note for reviewer", type: "textarea", colSpan: 2 },
        ],
      },
    ],
  },

  systemUser: {
    key: "systemUser",
    title: "New User",
    description: "System login with role-based permissions.",
    submitLabel: "Invite user",
    endpoint: "POST /api/v1/admin/users/",
    roles: ["manager"],
    sections: [
      {
        title: "User",
        fields: [
          { name: "name", label: "Full name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "role", label: "Role", type: "select", options: opts("administrator", "manager", "sales", "purchase", "warehouse", "production", "hr", "quality_control", "viewer"), required: true },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "active", label: "Active", type: "switch", defaultValue: true },
        ],
      },
    ],
  },
};

export function getFormDefinition(key: string): FormDefinition {
  const def = FORM_DEFINITIONS[key];
  if (!def) throw new Error(`Unknown form definition: ${key}`);
  return def;
}