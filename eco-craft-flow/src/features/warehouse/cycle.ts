import { getService } from "@/services/catalog";
import { logAudit, newLineId, notify } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { notifyRecoveredAlerts } from "@/features/inventory/cycle";
import { num, str } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

function byCode(entity: string, code: string) {
  return (db.get().records[entity] ?? []).find((r) => r.code === code || r.id === code);
}

async function bumpProduct(code: string, deltaOnHand: number, deltaInTransit = 0) {
  const p = byCode("products", code);
  if (!p) return;
  const updated = await getService("products").update(p.id, {
    fields: {
      ...p.fields,
      onHand: Math.max(0, num(p, "onHand") + deltaOnHand),
      inTransit: Math.max(0, num(p, "inTransit") + deltaInTransit),
    },
  });
  if (deltaOnHand > 0) await notifyRecoveredAlerts(updated);
}

async function movement(type: string, item: string, qty: number, warehouse: string, reference: string) {
  await getService("stock_movements").create({
    title: `${type} — ${item}`,
    status: "completed",
    fields: { type, product: item, qty, warehouse, reference, by: "Hari Karki" },
  });
}

function pickBin(warehouse: string, product: string) {
  const bins = db.get().records.bins ?? [];
  const inWh = bins.filter((b) => str(b, "warehouse") === warehouse);
  const same = inWh.find((b) => str(b, "product") === product);
  if (same) return same;
  return inWh.slice().sort((a, b) => num(a, "occupied") - num(b, "occupied"))[0] ?? inWh[0];
}

export async function putAwayGrn(grn: ErpRecord, binCode?: string): Promise<ErpRecord> {
  if (str(grn, "inspection") !== "Passed") throw new Error("Incoming inspection must pass before put-away.");
  if (str(grn, "putawayStatus") === "Put away") throw new Error("This GRN is already put away.");
  const warehouse = str(grn, "warehouse") || "WH-RM";
  const qty = num(grn, "acceptedQty") || grn.lines.reduce((s, l) => s + l.qty, 0);
  const product = grn.lines[0]?.item ?? "";
  const bin = binCode ? byCode("bins", binCode) : pickBin(warehouse, product);
  if (!bin) throw new Error(`No bin in ${warehouse} for put-away.`);
  await getService("bins").update(bin.id, {
    fields: { ...bin.fields, occupied: num(bin, "occupied") + qty, product: product || str(bin, "product") },
  });
  await movement("Put Away", product, qty, warehouse, grn.code);
  const updated = await getService("grns").update(grn.id, {
    fields: { ...grn.fields, putawayStatus: "Put away", putawayBin: bin.code },
  });
  logAudit({
    action: "edit",
    module: "warehouse",
    entity: "grns",
    recordId: grn.id,
    recordCode: grn.code,
    after: { putawayBin: bin.code },
  });
  notify({
    type: "stock",
    priority: "normal",
    title: `${grn.code} put away to ${bin.code}`,
    body: `${qty.toLocaleString("en-IN")} placed in ${warehouse}.`,
    module: "warehouse",
    link: { entity: "grns", id: grn.id },
  });
  return updated;
}

export async function dispatchTransfer(tr: ErpRecord): Promise<ErpRecord> {
  if (tr.status !== "approved" && tr.status !== "in_progress") {
    throw new Error("Approve the transfer before dispatch.");
  }
  if (str(tr, "stage") === "In Transit" || str(tr, "stage") === "Received") {
    throw new Error("This transfer is already in transit or received.");
  }
  const source = str(tr, "source") || "WH-FG";
  for (const l of tr.lines) {
    await bumpProduct(l.item, -l.qty, l.qty);
    await movement("Transfer Out", l.item, -l.qty, source, tr.code);
  }
  const updated = await getService("stock_transfers").update(tr.id, {
    status: "in_progress",
    fields: { ...tr.fields, stage: "In Transit" },
  });
  logAudit({ action: "convert", module: "warehouse", entity: "stock_transfers", recordId: tr.id, recordCode: tr.code, after: { stage: "In Transit" } });
  return updated;
}

export async function receiveTransfer(tr: ErpRecord): Promise<ErpRecord> {
  if (str(tr, "stage") !== "In Transit") throw new Error("Dispatch the transfer before receiving it.");
  const dest = str(tr, "destWarehouse") || (str(tr, "destination").startsWith("WH-") ? str(tr, "destination") : "WH-CS");
  for (const l of tr.lines) {
    await bumpProduct(l.item, l.qty, -l.qty);
    await movement("Transfer In", l.item, l.qty, dest, tr.code);
    const bin = pickBin(dest, l.item);
    if (bin) {
      await getService("bins").update(bin.id, {
        fields: { ...bin.fields, occupied: num(bin, "occupied") + l.qty, product: l.item },
      });
    }
  }
  const updated = await getService("stock_transfers").update(tr.id, {
    status: "completed",
    fields: { ...tr.fields, stage: "Received" },
  });
  logAudit({ action: "convert", module: "warehouse", entity: "stock_transfers", recordId: tr.id, recordCode: tr.code, after: { stage: "Received" } });
  return updated;
}

export async function completeBinTransfer(bt: ErpRecord): Promise<ErpRecord> {
  if (bt.status === "completed") throw new Error("Bin transfer already completed.");
  const qty = num(bt, "qty");
  const product = str(bt, "product");
  const source = byCode("bins", str(bt, "sourceBin"));
  const dest = byCode("bins", str(bt, "destinationBin"));
  if (!source || !dest) throw new Error("Source or destination bin is missing.");
  if (str(source, "warehouse") !== str(dest, "warehouse")) {
    throw new Error("Bin-to-bin moves must stay in the same warehouse. Use a stock transfer for WH-to-WH.");
  }
  await getService("bins").update(source.id, { fields: { ...source.fields, occupied: Math.max(0, num(source, "occupied") - qty) } });
  await getService("bins").update(dest.id, {
    fields: { ...dest.fields, occupied: num(dest, "occupied") + qty, product: product || str(dest, "product") },
  });
  const updated = await getService("bin_transfers").update(bt.id, { status: "completed" });
  logAudit({ action: "edit", module: "warehouse", entity: "bin_transfers", recordId: bt.id, recordCode: bt.code, after: { status: "completed" } });
  return updated;
}

export async function raiseCountAdjustment(count: ErpRecord): Promise<ErpRecord> {
  if (num(count, "variances") <= 0 && !count.lines.length) {
    throw new Error("This count has no variance to post.");
  }
  const existing = str(count, "adjustment");
  if (existing) throw new Error(`Variance already raised as ${existing}.`);
  const lines = count.lines.length
    ? count.lines.map((l) => ({ ...l, id: newLineId() }))
    : [
        {
          id: newLineId(),
          item: str(count, "product") || "FG-GRB-010",
          description: "Count variance",
          uom: "PCS",
          qty: -Math.abs(num(count, "variances") || 1),
          rate: 26,
          warehouse: str(count, "warehouse") || "WH-FG",
          taxPct: 13,
        },
      ];
  const adj = await getService("stock_adjustments").create({
    title: `Variance from ${count.code}`,
    status: "pending_approval",
    fields: {
      warehouse: str(count, "warehouse"),
      reason: "Cycle count variance",
      countRef: count.code,
      varianceValue: num(count, "varianceValue"),
    },
    lines,
  });
  await getService("stock_counts").update(count.id, {
    status: "completed",
    fields: { ...count.fields, adjustment: adj.code, approval: "Pending" },
  });
  logAudit({ action: "convert", module: "warehouse", entity: "stock_counts", recordId: count.id, recordCode: count.code, after: { adjustment: adj.code } });
  notify({
    type: "approval",
    priority: "high",
    title: `${adj.code} needs approval`,
    body: `Count ${count.code} posted a variance of ${num(count, "varianceValue")}.`,
    module: "warehouse",
    link: { entity: "stock_adjustments", id: adj.id },
  });
  return adj;
}
