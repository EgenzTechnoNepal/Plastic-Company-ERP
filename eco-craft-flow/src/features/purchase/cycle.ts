import { getService } from "@/services/catalog";
import { logAudit, newLineId, notify, recordTotal } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { isLowStock, num, str } from "@/lib/records";
import { notifyRecoveredAlerts } from "@/features/inventory/cycle";
import { findWarehousePlan, reorderQty } from "@/features/inventory/planning";
import { matchSupplierBill } from "@/services/api/phase3";
import type { ErpRecord, LineItem } from "@/types/erp";

export const MATCH_TOLERANCE_PCT = 2;

export interface VendorQuote {
  vendor: string;
  vendorName: string;
  rate: number;
  leadDays: number;
  paymentTerms: string;
  qualityRating: number;
  total: number;
}

export function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((l) => ({ ...l, id: newLineId() }));
}

export function quotesOf(rfq: ErpRecord): VendorQuote[] {
  const raw = rfq.fields.quotes ?? rfq.fields.comparison;
  if (!Array.isArray(raw)) return [];
  return raw.map((q) => {
    const row = q as Record<string, unknown>;
    return {
      vendor: String(row.vendor ?? ""),
      vendorName: String(row.vendorName ?? row.vendor ?? ""),
      rate: Number(row.rate ?? 0),
      leadDays: Number(row.leadDays ?? row.deliveryDays ?? 0),
      paymentTerms: String(row.paymentTerms ?? "30 Days"),
      qualityRating: Number(row.qualityRating ?? row.rating ?? 0),
      total: Number(row.total ?? 0),
    };
  });
}

function byCode(entity: string, code: string) {
  return (db.get().records[entity] ?? []).find((r) => r.code === code || r.id === code);
}

async function linkBoth(a: ErpRecord, b: ErpRecord) {
  await getService(a.entity).link(a.id, { entity: b.entity, id: b.id, label: b.code });
  await getService(b.entity).link(b.id, { entity: a.entity, id: a.id, label: a.code });
}

function lineValue(l: LineItem) {
  const gross = l.qty * l.rate;
  return gross * (1 - (l.discountPct ?? 0) / 100) * (1 + (l.taxPct ?? 0) / 100);
}

/**
 * Client-side 3-way match preview only — NOT authoritative.
 * Use matchSupplierBill() / PHASE3_TYPED_API.supplierBillMatch for real match status.
 */
export function threeWayMatch(bill: ErpRecord) {
  const po = byCode("purchase_orders", str(bill, "purchaseOrder"));
  const grn = byCode("grns", str(bill, "grn"));
  const exceptions: string[] = [];
  if (!po) exceptions.push("Purchase order not linked");
  if (!grn) exceptions.push("GRN not linked");
  const billQty = bill.lines.reduce((s, l) => s + l.qty, 0);
  const poQty = po?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  const grnQty = num(grn ?? ({} as ErpRecord), "acceptedQty") || grn?.lines.reduce((s, l) => s + l.qty, 0) || 0;
  const billAmt = recordTotal(bill);
  const poAmt = po ? recordTotal(po) : 0;
  const qtyTol = Math.max(poQty, 1) * (MATCH_TOLERANCE_PCT / 100);
  const amtTol = Math.max(poAmt, 1) * (MATCH_TOLERANCE_PCT / 100);
  if (po && Math.abs(billQty - poQty) > qtyTol) exceptions.push(`Qty vs PO: bill ${billQty} / PO ${poQty}`);
  if (grn && Math.abs(billQty - grnQty) > qtyTol) exceptions.push(`Qty vs GRN: bill ${billQty} / accepted ${grnQty}`);
  if (po && Math.abs(billAmt - poAmt) > amtTol) exceptions.push(`Value vs PO outside ${MATCH_TOLERANCE_PCT}%`);
  return {
    ok: exceptions.length === 0,
    exceptions,
    billQty,
    poQty,
    grnQty,
    billAmt,
    poAmt,
    advisory: true as const,
    message: exceptions.length
      ? `Preview: ${exceptions.join("; ")}`
      : "Preview: 3-way matched within tolerance (server match is authoritative)",
  };
}

export async function raisePrFromProduct(product: ErpRecord, plan?: ErpRecord): Promise<ErpRecord> {
  if (!isLowStock(product)) throw new Error("Stock is above reorder level — no PR needed.");
  const whPlan = plan ?? findWarehousePlan(product.code);
  const need = reorderQty(product, whPlan);
  const pr = await getService("purchase_requisitions").create({
    title: `Reorder ${product.title}`,
    status: "draft",
    fields: {
      name: `Reorder ${product.title}`,
      department: "Warehouse",
      requestedBy: "Hari Karki",
      requiredBy: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      priority: "High",
      justification: `${product.code} on hand ${num(product, "onHand")} vs reorder ${num(product, "reorderLevel")}. Raised from stock alert.`,
      source: "Reorder alert",
    },
    lines: [
      {
        id: newLineId(),
        item: product.code,
        description: product.title,
        uom: str(product, "uom", "KG"),
        qty: need,
        rate: num(product, "rate"),
        taxPct: num(product, "taxPct") || 13,
      },
    ],
  });
  await linkBoth(product, pr);
  logAudit({ action: "create", module: "purchase", entity: "purchase_requisitions", recordId: pr.id, recordCode: pr.code, reason: `From alert ${product.code}` });
  notify({ type: "stock", priority: "high", title: `PR ${pr.code} raised`, body: `${product.code} reorder for ${need.toLocaleString()} ${str(product, "uom", "KG")}.`, module: "purchase", link: { entity: "purchase_requisitions", id: pr.id } });
  return pr;
}

export async function convertPrToRfq(pr: ErpRecord): Promise<ErpRecord> {
  if (pr.status !== "approved" && pr.status !== "completed") {
    throw new Error("Approve the requisition before sending an RFQ.");
  }
  const suppliers = (db.get().records.suppliers ?? []).slice(0, 3);
  const qty = pr.lines[0]?.qty ?? 0;
  const quotes: VendorQuote[] = suppliers.map((s, i) => {
    const rate = (pr.lines[0]?.rate ?? 0) * (1 + (i - 1) * 0.03);
    return {
      vendor: s.code,
      vendorName: s.title,
      rate: Math.round(rate),
      leadDays: 7 + i * 4,
      paymentTerms: str(s, "paymentTerms", "30 Days"),
      qualityRating: num(s, "rating") || 4,
      total: Math.round(qty * rate * 1.13),
    };
  });
  const rfq = await getService("rfqs").create({
    title: `RFQ — ${pr.title}`,
    status: "in_progress",
    fields: {
      name: `RFQ — ${pr.title}`,
      requisition: pr.code,
      vendors: quotes.map((q) => q.vendor).join(", "),
      closingDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      quotes,
    },
    lines: cloneLines(pr.lines),
  });
  await getService("purchase_requisitions").update(pr.id, { status: "completed", fields: { ...pr.fields, rfq: rfq.code } });
  await linkBoth(pr, rfq);
  logAudit({ action: "convert", module: "purchase", entity: "purchase_requisitions", recordId: pr.id, recordCode: pr.code, after: { rfq: rfq.code } });
  return rfq;
}

export async function selectVendor(rfq: ErpRecord, vendor: string, justification: string): Promise<ErpRecord> {
  if (!justification.trim()) throw new Error("Selection justification is required.");
  const quote = quotesOf(rfq).find((q) => q.vendor === vendor);
  if (!quote) throw new Error("Vendor is not on this RFQ.");
  const updated = await getService("rfqs").update(rfq.id, {
    fields: {
      ...rfq.fields,
      selectedVendor: vendor,
      selectedVendorName: quote.vendorName,
      selectionJustification: justification.trim(),
    },
  });
  logAudit({ action: "edit", module: "purchase", entity: "rfqs", recordId: rfq.id, recordCode: rfq.code, reason: justification, after: { selectedVendor: vendor } });
  return updated;
}

export async function convertRfqToPo(rfq: ErpRecord): Promise<ErpRecord> {
  const vendor = str(rfq, "selectedVendor");
  if (!vendor) throw new Error("Select a vendor (with justification) before creating a PO.");
  const supplier = byCode("suppliers", vendor);
  const quote = quotesOf(rfq).find((q) => q.vendor === vendor);
  const lines = cloneLines(rfq.lines).map((l) => ({ ...l, rate: quote?.rate ?? l.rate }));
  const po = await getService("purchase_orders").create({
    title: supplier?.title ?? vendor,
    status: "draft",
    fields: {
      supplier: vendor,
      supplierName: supplier?.title ?? str(rfq, "selectedVendorName"),
      requisition: str(rfq, "requisition"),
      rfq: rfq.code,
      paymentTerms: quote?.paymentTerms ?? "30 Days",
      currency: "NPR",
      deliveryDate: new Date(Date.now() + (quote?.leadDays ?? 14) * 86400000).toISOString().slice(0, 10),
      freight: 0,
      duty: 0,
      clearing: 0,
      amendment: "Rev 01",
      receiptStatus: "Pending",
      billStatus: "Not billed",
    },
    lines,
  });
  await getService("rfqs").update(rfq.id, { status: "completed", fields: { ...rfq.fields } });
  await linkBoth(rfq, po);
  logAudit({ action: "convert", module: "purchase", entity: "rfqs", recordId: rfq.id, recordCode: rfq.code, after: { purchaseOrder: po.code } });
  return po;
}

export async function amendPurchaseOrder(po: ErpRecord): Promise<ErpRecord> {
  const current = String(po.fields.amendment ?? "Rev 01");
  const n = Number(current.replace(/\D+/g, "")) || 1;
  const amendment = `Rev ${String(n + 1).padStart(2, "0")}`;
  const copy = await getService("purchase_orders").create({
    title: `${str(po, "supplierName") || po.title} — ${amendment}`,
    status: "draft",
    fields: { ...po.fields, amendment, previousAmendment: po.code, receiptStatus: "Pending", billStatus: "Not billed" },
    lines: cloneLines(po.lines),
  });
  await linkBoth(po, copy);
  logAudit({ action: "create", module: "purchase", entity: "purchase_orders", recordId: copy.id, recordCode: copy.code, reason: `Amendment of ${po.code} (original kept)` });
  return copy;
}

export async function createGateEntry(po: ErpRecord): Promise<ErpRecord> {
  if (po.status !== "approved" && po.status !== "in_progress") {
    throw new Error("Approve the purchase order before gate entry.");
  }
  const ge = await getService("gate_entries").create({
    title: `Gate Entry — ${str(po, "supplierName") || po.title}`,
    status: "in_progress",
    fields: {
      purchaseOrder: po.code,
      vehicle: "BA 2 KHA 0000",
      driver: "To be filled at gate",
      inTime: new Date().toTimeString().slice(0, 5),
      securityBy: "Gate 1",
    },
  });
  await getService("purchase_orders").update(po.id, { status: "in_progress", fields: { ...po.fields, receiptStatus: "At gate" } });
  await linkBoth(po, ge);
  logAudit({ action: "convert", module: "purchase", entity: "purchase_orders", recordId: po.id, recordCode: po.code, after: { gateEntry: ge.code } });
  return ge;
}

export async function createGrnFromGate(ge: ErpRecord): Promise<ErpRecord> {
  const po = byCode("purchase_orders", str(ge, "purchaseOrder"));
  if (!po) throw new Error("Gate entry has no purchase order.");
  const grn = await getService("grns").create({
    title: `GRN — ${str(po, "supplierName")}`,
    status: "in_progress",
    fields: {
      purchaseOrder: po.code,
      supplierName: str(po, "supplierName"),
      gateEntry: ge.code,
      warehouse: "WH-RM",
      inspection: "Pending",
      batch: `RM-BATCH-${new Date().toISOString().slice(5, 10).replace("-", "")}`,
      acceptedQty: 0,
      rejectedQty: 0,
    },
    lines: cloneLines(po.lines),
  });
  await getService("gate_entries").update(ge.id, { status: "completed" });
  await linkBoth(ge, grn);
  await linkBoth(po, grn);
  logAudit({ action: "convert", module: "purchase", entity: "gate_entries", recordId: ge.id, recordCode: ge.code, after: { grn: grn.code } });
  return grn;
}

export async function inspectGrn(grn: ErpRecord, result: "Passed" | "Failed"): Promise<ErpRecord> {
  const qty = grn.lines.reduce((s, l) => s + l.qty, 0);
  const accepted = result === "Passed" ? qty : 0;
  const rejected = result === "Passed" ? 0 : qty;
  // Phase 2: do NOT mutate products.onHand or DomainRecord stock_movements here.
  // Authoritative stock is typed GRN post → QC_HOLD → QC pass/fail → StockLedger / FIFO.
  // Use PHASE2_TYPED_API (services/api/phase2.ts) for posting; this path only updates UI metadata.
  if (result === "Passed") {
    const first = grn.lines[0];
    if (first) {
      await getService("qc_inspections").create({
        title: `Incoming — ${first.item}`,
        status: "approved",
        fields: {
          stage: "Incoming",
          reference: grn.code,
          product: first.item,
          batch: str(grn, "batch"),
          result: "Pass",
          inspector: "QC Lead",
          disposition: "Release",
        },
      });
    }
  }
  const updated = await getService("grns").update(grn.id, {
    status: "completed",
    fields: { ...grn.fields, inspection: result, acceptedQty: accepted, rejectedQty: rejected },
  });
  const po = byCode("purchase_orders", str(grn, "purchaseOrder"));
  if (po) {
    await getService("purchase_orders").update(po.id, { fields: { ...po.fields, receiptStatus: result === "Passed" ? "Received" : "Rejected" } });
  }
  logAudit({ action: "edit", module: "purchase", entity: "grns", recordId: grn.id, recordCode: grn.code, after: { inspection: result } });
  if (result === "Failed") {
    notify({ type: "quality", priority: "high", title: `${grn.code} failed incoming QC`, body: "Raise a purchase return / debit note for the rejected qty.", module: "purchase", link: { entity: "grns", id: grn.id } });
  }
  return updated;
}

export async function createBillFromGrn(grn: ErpRecord): Promise<ErpRecord> {
  if (str(grn, "inspection") !== "Passed") throw new Error("Incoming inspection must pass before billing.");
  const po = byCode("purchase_orders", str(grn, "purchaseOrder"));
  const lines = cloneLines(grn.lines).map((l) => ({ ...l, qty: num(grn, "acceptedQty") || l.qty }));
  const bill = await getService("purchase_bills").create({
    title: str(grn, "supplierName") || grn.title,
    status: "draft",
    fields: {
      supplier: str(po ?? grn, "supplier"),
      supplierName: str(grn, "supplierName"),
      vendorInvoiceNo: `SIM-${Date.now().toString(36).toUpperCase()}`,
      purchaseOrder: str(grn, "purchaseOrder"),
      grn: grn.code,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      matchStatus: "Pending",
      freight: num(po ?? grn, "freight"),
      duty: num(po ?? grn, "duty"),
      clearing: num(po ?? grn, "clearing"),
      paid: 0,
    },
    lines,
  });
  // Do not treat client threeWayMatch as authority — leave Pending until server match.
  const typedBillId = str(bill, "typedBillId");
  let matchStatus = "Pending";
  let matchNote = "Awaiting server 3-way match (PHASE3_TYPED_API.supplierBillMatch)";
  if (typedBillId) {
    try {
      const matched = await matchSupplierBill(typedBillId);
      matchStatus = matched.match_status;
      matchNote = matched.match_exceptions || matched.match_status;
    } catch {
      matchStatus = "Pending";
      matchNote = "Server match unavailable; client preview is not authoritative";
    }
  }
  await getService("purchase_bills").update(bill.id, {
    fields: { ...bill.fields, matchStatus, matchNote },
  });
  await getService("grns").update(grn.id, { fields: { ...grn.fields, bill: bill.code } });
  if (po) await getService("purchase_orders").update(po.id, { fields: { ...po.fields, billStatus: "Billed" } });
  await linkBoth(grn, bill);
  logAudit({ action: "convert", module: "purchase", entity: "grns", recordId: grn.id, recordCode: grn.code, after: { bill: bill.code, match: matchNote } });
  const fresh = byCode("purchase_bills", bill.code) ?? bill;
  return fresh;
}

export async function simulateOcrExtract(scan: ErpRecord): Promise<ErpRecord> {
  const po = (db.get().records.purchase_orders ?? [])[0];
  const grn = (db.get().records.grns ?? [])[0];
  const total = po ? recordTotal(po) : 1789480;
  const updated = await getService("ocr_bills").update(scan.id, {
    status: "in_progress",
    fields: {
      ...scan.fields,
      source: str(scan, "source") || "PDF Upload",
      vendor: str(po ?? scan, "supplierName") || "Nepal Polymer Imports",
      invoiceNo: `OCR/${new Date().getFullYear()}/${Math.floor(Math.random() * 900 + 100)}`,
      pan: "601990001",
      extractedTotal: total,
      confidence: 0.91,
      matchStatus: "Matched",
      purchaseOrder: po?.code ?? str(scan, "purchaseOrder"),
      grn: grn?.code ?? str(scan, "grn"),
    },
  });
  logAudit({ action: "edit", module: "purchase", entity: "ocr_bills", recordId: scan.id, recordCode: scan.code, after: { confidence: 0.91 } });
  notify({
    type: "system",
    priority: "normal",
    title: `${scan.code} extracted (simulated OCR)`,
    body: "Confidence 91%. Correct fields, then convert to a vendor bill. Image stays attached locally.",
    module: "purchase",
    link: { entity: "ocr_bills", id: scan.id },
  });
  return updated;
}

export async function convertOcrToBill(scan: ErpRecord): Promise<ErpRecord> {
  if (num(scan, "confidence") < 0.5 && !str(scan, "invoiceNo")) {
    throw new Error("Run simulated extract (or fill invoice no.) before converting.");
  }
  const po = byCode("purchase_orders", str(scan, "purchaseOrder"));
  const grn = byCode("grns", str(scan, "grn"));
  const vendorInvoiceNo = str(scan, "invoiceNo");
  const amount = num(scan, "extractedTotal");
  const dup = (db.get().records.purchase_bills ?? []).find(
    (b) =>
      str(b, "vendorInvoiceNo") === vendorInvoiceNo &&
      vendorInvoiceNo &&
      Math.abs(recordTotal(b) - amount) < 0.01 &&
      (str(b, "supplierName") === str(scan, "vendor") || str(b, "supplier") === str(scan, "supplier")),
  );
  if (dup) {
    throw new Error(`Duplicate vendor bill ${dup.code} (same invoice no. + amount).`);
  }
  const bill = await getService("purchase_bills").create({
    title: str(scan, "vendor") || "OCR bill",
    status: "draft",
    date: str(scan, "invoiceDate") || scan.date,
    fields: {
      supplier: str(po ?? scan, "supplier"),
      supplierName: str(scan, "vendor"),
      vendorInvoiceNo,
      vendorPan: str(scan, "pan"),
      buyerPan: str(scan, "buyerPan"),
      vat: num(scan, "vat"),
      purchaseOrder: po?.code,
      grn: grn?.code,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      matchStatus: "Pending",
      ocrRef: scan.code,
      paid: 0,
    },
    lines: cloneLines(po?.lines ?? grn?.lines ?? []),
  });
  // OCR path stays DomainRecord; match status is Pending until typed bill + server match.
  const preview = threeWayMatch(bill);
  await getService("purchase_bills").update(bill.id, {
    fields: {
      ...bill.fields,
      matchStatus: "Pending",
      matchNote: `Client preview only: ${preview.message}`,
    },
  });
  await getService("ocr_bills").update(scan.id, {
    status: "completed",
    fields: { ...scan.fields, matchStatus: "Pending (server match required)" },
  });
  await linkBoth(scan, bill);
  logAudit({
    action: "convert",
    module: "purchase",
    entity: "ocr_bills",
    recordId: scan.id,
    recordCode: scan.code,
    after: { purchaseBill: bill.code },
  });
  return byCode("purchase_bills", bill.code) ?? bill;
}

export async function convertGrnToReturn(grn: ErpRecord): Promise<ErpRecord> {
  const po = byCode("purchase_orders", str(grn, "purchaseOrder"));
  const qty = num(grn, "rejectedQty") || grn.lines.reduce((s, l) => s + l.qty, 0);
  const ret = await getService("purchase_returns").create({
    title: `Return — ${str(grn, "supplierName")}`,
    status: "draft",
    fields: {
      supplier: str(po ?? grn, "supplier"),
      grn: grn.code,
      reason: "Incoming inspection failed",
      inspection: "Failed",
    },
    lines: cloneLines(grn.lines).map((l) => ({ ...l, qty })),
  });
  await linkBoth(grn, ret);
  logAudit({ action: "convert", module: "purchase", entity: "grns", recordId: grn.id, recordCode: grn.code, after: { purchaseReturn: ret.code } });
  return ret;
}

export async function convertReturnToDebitNote(ret: ErpRecord): Promise<ErpRecord> {
  const amount = recordTotal(ret) || ret.lines.reduce((s, l) => s + lineValue(l), 0);
  const dn = await getService("debit_notes").create({
    title: `Debit Note — ${str(ret, "supplier")}`,
    status: "draft",
    fields: {
      supplier: str(ret, "supplier"),
      purchaseReturn: ret.code,
      amount,
      reason: str(ret, "reason") || "Rejected quantity",
    },
  });
  const supplier = byCode("suppliers", str(ret, "supplier"));
  if (supplier) {
    await getService("suppliers").update(supplier.id, {
      fields: { ...supplier.fields, outstanding: Math.max(0, num(supplier, "outstanding") - amount), qualityScore: Math.max(1, num(supplier, "qualityScore") - 2) },
    });
  }
  await getService("purchase_returns").update(ret.id, { status: "completed", fields: { ...ret.fields, debitNote: dn.code } });
  await linkBoth(ret, dn);
  logAudit({ action: "convert", module: "purchase", entity: "purchase_returns", recordId: ret.id, recordCode: ret.code, after: { debitNote: dn.code, vatRegister: "purchase return" } });
  return dn;
}

export async function payVendorBill(bill: ErpRecord, amount?: number): Promise<ErpRecord> {
  const due = Math.max(0, recordTotal(bill) - num(bill, "paid"));
  const pay = amount && amount > 0 ? Math.min(amount, due) : due;
  if (pay <= 0) throw new Error("Nothing outstanding on this bill.");
  const vp = await getService("vendor_payments").create({
    title: `Payment — ${str(bill, "supplierName") || bill.title}`,
    status: "draft",
    fields: {
      supplier: str(bill, "supplier"),
      bill: bill.code,
      mode: "Bank Transfer",
      bank: "Nabil Bank",
      reference: `SIM-${Date.now().toString(36).toUpperCase()}`,
      amount: pay,
    },
  });
  await getService("purchase_bills").update(bill.id, { fields: { ...bill.fields, paid: num(bill, "paid") + pay } });
  await linkBoth(bill, vp);
  logAudit({ action: "convert", module: "purchase", entity: "purchase_bills", recordId: bill.id, recordCode: bill.code, after: { payment: vp.code, amount: pay } });
  return vp;
}
