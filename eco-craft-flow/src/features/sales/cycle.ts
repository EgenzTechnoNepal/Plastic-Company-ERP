import { getService } from "@/services/catalog";
import { logAudit, newLineId, notify, recordTotal } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { num, str } from "@/lib/records";
import type { ErpRecord, LineItem } from "@/types/erp";

export const DISCOUNT_THRESHOLD_PCT = 10;

export function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((l) => ({ ...l, id: newLineId() }));
}

export function maxDiscountPct(r: ErpRecord): number {
  return r.lines.reduce((m, l) => Math.max(m, l.discountPct ?? 0), 0);
}

export function quotationNeedsDiscountApproval(r: ErpRecord): boolean {
  return maxDiscountPct(r) > DISCOUNT_THRESHOLD_PCT;
}

export function creditCheck(customer: ErpRecord | undefined, extra: number) {
  if (!customer) return { ok: false, message: "Customer not found", limit: 0, outstanding: 0, next: extra };
  const limit = num(customer, "creditLimit");
  const outstanding = num(customer, "outstanding");
  const next = outstanding + extra;
  if (next > limit) {
    return {
      ok: false,
      message: `Credit limit exceeded: outstanding ${outstanding.toLocaleString()} + ${extra.toLocaleString()} > limit ${limit.toLocaleString()} NPR.`,
      limit,
      outstanding,
      next,
    };
  }
  return { ok: true, message: "Within credit limit", limit, outstanding, next };
}

export function stockCheck(lines: LineItem[]) {
  const products = db.get().records.products ?? [];
  const shortages: Array<{ item: string; need: number; free: number }> = [];
  for (const l of lines) {
    if (!l.item || !l.qty) continue;
    const p = products.find((x) => x.code === l.item);
    const free = p ? Math.max(0, num(p, "onHand") - num(p, "reserved")) : 0;
    if (l.qty > free) shortages.push({ item: l.item || l.description || "item", need: l.qty, free });
  }
  return {
    ok: shortages.length === 0,
    shortages,
    message: shortages.length
      ? `Insufficient free stock: ${shortages.map((s) => `${s.item} need ${s.need}, free ${s.free}`).join("; ")}.`
      : "Free stock available",
  };
}

function customerByCode(code: string) {
  return (db.get().records.customers ?? []).find((c) => c.code === code || c.id === code);
}

async function linkBoth(a: ErpRecord, b: ErpRecord) {
  await getService(a.entity).link(a.id, { entity: b.entity, id: b.id, label: b.code });
  await getService(b.entity).link(b.id, { entity: a.entity, id: a.id, label: a.code });
}

export async function convertLeadToOpportunity(lead: ErpRecord): Promise<ErpRecord> {
  const opp = await getService("opportunities").create({
    title: lead.title,
    status: "open",
    fields: {
      name: lead.title,
      customer: lead.title,
      stage: "qualification",
      value: num(lead, "expectedValue"),
      probability: num(lead, "probability") || 40,
      owner: str(lead, "owner"),
      expectedClose: str(lead, "expectedClose"),
      lead: lead.code,
    },
  });
  await getService("leads").update(lead.id, {
    status: "completed",
    fields: { ...lead.fields, stage: "won" },
  });
  await linkBoth({ ...lead, entity: "leads" }, opp);
  logAudit({ action: "convert", module: "crm", entity: "leads", recordId: lead.id, recordCode: lead.code, after: { opportunity: opp.code } });
  notify({ type: "system", priority: "normal", title: `${lead.code} converted`, body: `Opportunity ${opp.code} created.`, module: "crm", link: { entity: "opportunities", id: opp.id } });
  return opp;
}

export async function markLeadLost(lead: ErpRecord, reason: string): Promise<ErpRecord> {
  if (!reason.trim()) throw new Error("Lost reason is required");
  const updated = await getService("leads").update(lead.id, {
    status: "closed",
    fields: { ...lead.fields, stage: "lost", lostReason: reason.trim() },
  });
  logAudit({ action: "edit", module: "crm", entity: "leads", recordId: lead.id, recordCode: lead.code, reason, after: { stage: "lost" } });
  return updated;
}

export async function reviseQuotation(qt: ErpRecord): Promise<ErpRecord> {
  const current = String(qt.fields.revision ?? "Rev 01");
  const n = Number(current.replace(/\D+/g, "")) || 1;
  const revision = `Rev ${String(n + 1).padStart(2, "0")}`;
  const copy = await getService("quotations").create({
    title: `${str(qt, "customerName") || qt.title} — ${revision}`,
    status: "draft",
    fields: { ...qt.fields, revision, dispatchStatus: "Draft", sentAt: "", openedAt: "", acceptedAt: "", previousRevision: qt.code },
    lines: cloneLines(qt.lines),
  });
  await linkBoth(qt, copy);
  logAudit({ action: "create", module: "crm", entity: "quotations", recordId: copy.id, recordCode: copy.code, reason: `Revised from ${qt.code} (not overwritten)` });
  return copy;
}

export async function dispatchQuotation(qt: ErpRecord, channel: "Email" | "WhatsApp" | "SMS"): Promise<ErpRecord> {
  const updated = await getService("quotations").update(qt.id, {
    fields: {
      ...qt.fields,
      channel,
      dispatchStatus: "Sent",
      sentAt: new Date().toISOString(),
      tracking: `${channel.slice(0, 2).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    },
  });
  logAudit({ action: "send", module: "crm", entity: "quotations", recordId: qt.id, recordCode: qt.code, after: { channel } });
  notify({
    type: "system",
    priority: "normal",
    title: `${qt.code} dispatched (${channel})`,
    body: "Simulated send — Email/WhatsApp/SMS console will attach when the backend is connected.",
    module: "crm",
    link: { entity: "quotations", id: qt.id },
  });
  return updated;
}

export async function convertQuotationToOrder(qt: ErpRecord): Promise<ErpRecord> {
  if (qt.status !== "approved" && qt.status !== "completed") {
    throw new Error("Approve the quotation before converting to a sales order.");
  }
  const customer = customerByCode(str(qt, "customer"));
  const credit = creditCheck(customer, recordTotal(qt));
  if (!credit.ok) throw new Error(credit.message);
  const stock = stockCheck(qt.lines);
  if (!stock.ok) throw new Error(stock.message);
  const so = await getService("sales_orders").create({
    title: str(qt, "customerName") || qt.title,
    status: "draft",
    fields: {
      customer: str(qt, "customer"),
      customerName: str(qt, "customerName"),
      quotation: qt.code,
      paymentTerms: str(qt, "paymentTerms"),
      currency: str(qt, "currency") || "NPR",
      salesperson: str(qt, "salesperson"),
      deliveryDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      allocationStatus: "Not Allocated",
      pickStatus: "Not Picked",
      packStatus: "Not Packed",
      dispatchStatus: "Pending",
      invoiceStatus: "Not Invoiced",
      paymentStatus: "Unpaid",
    },
    lines: cloneLines(qt.lines),
  });
  await getService("quotations").update(qt.id, { status: "completed", fields: { ...qt.fields, dispatchStatus: "Converted" } });
  await linkBoth(qt, so);
  logAudit({ action: "convert", module: "sales", entity: "quotations", recordId: qt.id, recordCode: qt.code, after: { salesOrder: so.code } });
  return so;
}

export async function fulfillSalesOrder(so: ErpRecord, step: "allocate" | "pick" | "pack"): Promise<ErpRecord> {
  const fields = { ...so.fields };
  if (step === "allocate") {
    if (so.status !== "approved" && so.status !== "in_progress") {
      throw new Error("Approve the sales order before allocating stock.");
    }
    const customer = customerByCode(str(so, "customer"));
    const credit = creditCheck(customer, recordTotal(so));
    if (!credit.ok) throw new Error(credit.message);
    const stock = stockCheck(so.lines);
    if (!stock.ok) throw new Error(stock.message);
    const products = db.get().records.products ?? [];
    for (const l of so.lines) {
      const p = products.find((x) => x.code === l.item);
      if (!p) continue;
      await getService("products").update(p.id, { fields: { ...p.fields, reserved: num(p, "reserved") + l.qty } });
    }
    fields.allocationStatus = "Allocated";
  }
  if (step === "pick") {
    if (str(so, "allocationStatus") !== "Allocated") throw new Error("Allocate stock before picking.");
    fields.pickStatus = "Picked";
  }
  if (step === "pack") {
    if (str(so, "pickStatus") !== "Picked") throw new Error("Pick the order before packing.");
    fields.packStatus = "Packed";
  }
  const updated = await getService("sales_orders").update(so.id, {
    status: "in_progress",
    fields,
  });
  logAudit({ action: "edit", module: "sales", entity: "sales_orders", recordId: so.id, recordCode: so.code, after: { step } });
  return updated;
}

export async function convertOrderToDelivery(so: ErpRecord): Promise<ErpRecord> {
  if (str(so, "packStatus") !== "Packed") throw new Error("Pack the order before creating a gate pass / challan.");
  const gp = `GP-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const dn = await getService("deliveries").create({
    title: `Delivery Challan — ${str(so, "customerName") || so.title}`,
    status: "completed",
    fields: {
      salesOrder: so.code,
      customerName: str(so, "customerName"),
      vehicle: "To assign",
      driver: "To assign",
      gatePass: gp,
      destination: str(so, "customerName"),
      packedBy: "Warehouse",
    },
    lines: cloneLines(so.lines),
  });
  await getService("sales_orders").update(so.id, {
    fields: { ...so.fields, dispatchStatus: "Dispatched", gatePass: gp },
  });
  await linkBoth(so, dn);
  logAudit({ action: "convert", module: "sales", entity: "sales_orders", recordId: so.id, recordCode: so.code, after: { delivery: dn.code, gatePass: gp } });
  return dn;
}

export async function convertDeliveryToInvoice(dn: ErpRecord): Promise<ErpRecord> {
  const soCode = str(dn, "salesOrder");
  const so = (db.get().records.sales_orders ?? []).find((r) => r.code === soCode);
  const inv = await getService("invoices").create({
    title: str(dn, "customerName") || dn.title,
    status: "draft",
    fields: {
      customer: so ? str(so, "customer") : "",
      customerName: str(dn, "customerName"),
      salesOrder: soCode,
      delivery: dn.code,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      paid: 0,
      fiscalYear: "2082/83",
      irdStatus: "Pending (simulated)",
    },
    lines: cloneLines(dn.lines),
  });
  if (so) {
    await getService("sales_orders").update(so.id, { fields: { ...so.fields, invoiceStatus: "Invoiced" } });
    await linkBoth(so, inv);
  }
  await linkBoth(dn, inv);
  logAudit({ action: "convert", module: "sales", entity: "deliveries", recordId: dn.id, recordCode: dn.code, after: { invoice: inv.code } });
  return inv;
}

export async function convertReturnToCreditNote(sr: ErpRecord, raiseNcr: boolean): Promise<{ creditNote: ErpRecord; ncr?: ErpRecord }> {
  if (!["approved", "completed"].includes(sr.status) && sr.status !== "submitted") {
    throw new Error("Authorise / approve the return before issuing a credit note.");
  }
  const amount = recordTotal(sr);
  const cn = await getService("credit_notes").create({
    title: `Credit note — ${str(sr, "customerName") || sr.title}`,
    status: "draft",
    fields: {
      customerName: str(sr, "customerName"),
      salesReturn: sr.code,
      amount,
      reason: str(sr, "reason"),
    },
    lines: cloneLines(sr.lines),
  });
  const patch: Record<string, unknown> = { ...sr.fields, creditNote: cn.code, disposition: str(sr, "disposition") || "Quarantine" };
  let ncr: ErpRecord | undefined;
  if (raiseNcr) {
    ncr = await getService("ncrs").create({
      title: `Customer return ${sr.code}`,
      status: "open",
      fields: {
        name: `Customer return ${sr.code}`,
        source: "Customer Complaint",
        reference: sr.code,
        severity: "Major",
        product: sr.lines[0]?.item,
        problem: str(sr, "reason") || "Sales return raised NCR",
        raisedBy: "Sales",
      },
    });
    patch.ncr = ncr.code;
    await linkBoth(sr, ncr);
  }
  await getService("sales_returns").update(sr.id, { status: "completed", fields: patch });
  await linkBoth(sr, cn);
  logAudit({ action: "convert", module: "sales", entity: "sales_returns", recordId: sr.id, recordCode: sr.code, after: { creditNote: cn.code, ncr: ncr?.code } });
  return { creditNote: cn, ncr };
}

export function slaDeadline(ticket: ErpRecord): { due: Date; overdue: boolean; remainingMs: number } {
  const opened = str(ticket, "openedAt") || ticket.createdAt;
  const hours = num(ticket, "slaHours") || 24;
  const due = new Date(new Date(opened).getTime() + hours * 3600 * 1000);
  const remainingMs = due.getTime() - Date.now();
  return { due, overdue: remainingMs < 0 && ticket.status !== "closed" && ticket.status !== "completed", remainingMs };
}
