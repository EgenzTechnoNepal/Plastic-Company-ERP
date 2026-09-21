import { getService } from "@/services/catalog";
import { logAudit, newLineId, notify } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { syncReorderAlert } from "@/features/inventory/cycle";
import { num, str } from "@/lib/records";
import { useAuthStore } from "@/store/auth";
import type { ErpRecord, LineItem } from "@/types/erp";

export const LABOUR_RATE = 450;
export const DOWNTIME_CODES = ["No material", "Breakdown", "Changeover", "Quality hold", "Power cut"] as const;

export interface ComponentMeta {
  scrapPct?: number;
  yieldPct?: number;
  substitute?: string;
  phantom?: boolean;
}

export interface BomNode {
  item: string;
  description: string;
  qty: number;
  uom: string;
  rate: number;
  scrapPct: number;
  yieldPct: number;
  substitute?: string;
  phantom: boolean;
  level: number;
  bom?: string;
  children: BomNode[];
}

export interface MrpSuggestion {
  item: string;
  itemType: string;
  gross: number;
  onHand: number;
  allocated: number;
  openPo: number;
  wip: number;
  net: number;
  lotQty: number;
  needBy: string;
  suggest: string;
  converted?: boolean;
  leadDays: number;
}

export interface ScheduleSlot {
  machine: string;
  workOrder: string;
  start: string;
  end: string;
  setupMins: number;
}

export interface SlotConflict {
  index: number;
  machine: string;
  workOrder: string;
  reason: string;
}

function byCode(entity: string, code: string) {
  return (db.get().records[entity] ?? []).find((r) => r.code === code || r.id === code);
}

function actorName() {
  return useAuthStore.getState().user?.name ?? "Bikash Thapa";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((l) => ({ ...l, id: newLineId() }));
}

async function linkBoth(a: ErpRecord, b: ErpRecord) {
  await getService(a.entity).link(a.id, { entity: b.entity, id: b.id, label: b.code });
  await getService(b.entity).link(b.id, { entity: a.entity, id: a.id, label: a.code });
}

export function metaOf(bom: ErpRecord, item: string): ComponentMeta {
  const raw = bom.fields.componentMeta;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = (raw as Record<string, ComponentMeta>)[item];
  return row ?? {};
}

export function approvedBomFor(product: string, asOf = today()): ErpRecord | undefined {
  const rows = (db.get().records.boms ?? []).filter(
    (b) => str(b, "product") === product && (b.status === "approved" || b.status === "active"),
  );
  const dated = rows.filter((b) => !str(b, "effectiveFrom") || str(b, "effectiveFrom") <= asOf);
  const pool = dated.length ? dated : rows;
  return pool.slice().sort((a, b) => str(b, "effectiveFrom").localeCompare(str(a, "effectiveFrom")))[0];
}

export function explodeBom(bom: ErpRecord, qty: number, level = 0, seen = new Set<string>()): BomNode[] {
  const output = num(bom, "outputQty") || 1;
  const factor = qty / output;
  if (seen.has(bom.code) || level > 8) return [];
  return bom.lines.map((line) => {
    const branchSeen = new Set(seen);
    branchSeen.add(bom.code);
    const meta = metaOf(bom, line.item);
    const scrapPct = meta.scrapPct ?? 0;
    const yieldPct = meta.yieldPct ?? 100;
    const yieldFactor = yieldPct > 0 ? 100 / yieldPct : 1;
    const req = round3(line.qty * factor * (1 + scrapPct / 100) * yieldFactor);
    const childBom = approvedBomFor(line.item);
    const phantom = Boolean(meta.phantom) || str(byCode("products", line.item) ?? ({} as ErpRecord), "type") === "Semi-Finished";
    const children = childBom ? explodeBom(childBom, req, level + 1, branchSeen) : [];
    return {
      item: line.item,
      description: line.description ?? line.item,
      qty: req,
      uom: line.uom ?? "KG",
      rate: line.rate,
      scrapPct,
      yieldPct,
      substitute: meta.substitute,
      phantom,
      level,
      bom: childBom?.code,
      children,
    };
  });
}

export function flattenLeaves(nodes: BomNode[]): BomNode[] {
  const out: BomNode[] = [];
  const walk = (n: BomNode) => {
    if (n.children.length) n.children.forEach(walk);
    else out.push(n);
  };
  nodes.forEach(walk);
  return out;
}

export function rolledCost(bom: ErpRecord, qty?: number): number {
  const output = qty ?? (num(bom, "outputQty") || 1);
  const leaves = flattenLeaves(explodeBom(bom, output));
  const material = leaves.reduce((s, n) => s + n.qty * n.rate, 0);
  return round3(material / output);
}

export function whereUsed(item: string): ErpRecord[] {
  return (db.get().records.boms ?? []).filter((b) => b.lines.some((l) => l.item === item) || str(b, "product") === item);
}

export function planShortage(plan: ErpRecord) {
  return plan.lines.map((line) => {
    const product = byCode("products", line.item);
    const onHand = product ? num(product, "onHand") : 0;
    const reserved = product ? num(product, "reserved") : 0;
    const available = Math.max(0, onHand - reserved);
    const shortage = Math.max(0, line.qty - available);
    return {
      item: line.item,
      description: line.description ?? line.item,
      planned: line.qty,
      onHand,
      reserved,
      available,
      shortage,
      strategy: str(plan, "strategy") || "Make to Stock",
    };
  });
}

function openPoQty(item: string): number {
  const product = byCode("products", item);
  const inTransit = product ? num(product, "inTransit") : 0;
  const pos = (db.get().records.purchase_orders ?? []).filter((po) => {
    if (["cancelled", "closed", "completed"].includes(po.status)) return false;
    const receipt = str(po, "receiptStatus");
    return receipt !== "Received";
  });
  const fromPo = pos.reduce((s, po) => s + po.lines.filter((l) => l.item === item).reduce((a, l) => a + l.qty, 0), 0);
  return Math.max(inTransit, fromPo);
}

function wipQty(item: string): number {
  const open = (db.get().records.work_orders ?? []).filter((wo) => wo.status === "released" || wo.status === "in_progress");
  let qty = 0;
  for (const wo of open) {
    const remaining = Math.max(0, num(wo, "plannedQty") - num(wo, "producedQty"));
    if (str(wo, "product") === item) {
      qty += remaining;
      continue;
    }
    const bom = byCode("boms", str(wo, "bom")) ?? approvedBomFor(str(wo, "product"));
    if (!bom) continue;
    qty += flattenLeaves(explodeBom(bom, remaining))
      .filter((n) => n.item === item)
      .reduce((s, n) => s + n.qty, 0);
  }
  return round3(qty);
}

function lotSize(product: ErpRecord | undefined, net: number, method: string): number {
  if (net <= 0) return 0;
  const moq = product ? num(product, "moq") || 1 : 1;
  if (method === "Fixed Quantity") return Math.max(net, moq);
  if (method === "EOQ") return Math.ceil(net / moq) * moq;
  return net;
}

export function mrpRowsOf(run: ErpRecord): MrpSuggestion[] {
  const raw = run.fields.rows;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      item: String(r.item ?? ""),
      itemType: String(r.itemType ?? ""),
      gross: Number(r.gross ?? 0),
      onHand: Number(r.onHand ?? 0),
      allocated: Number(r.allocated ?? 0),
      openPo: Number(r.openPo ?? 0),
      wip: Number(r.wip ?? 0),
      net: Number(r.net ?? 0),
      lotQty: Number(r.lotQty ?? r.net ?? 0),
      needBy: String(r.needBy ?? ""),
      suggest: String(r.suggest ?? "None"),
      converted: Boolean(r.converted),
      leadDays: Number(r.leadDays ?? 7),
    };
  });
}

export function computeMrp(plan: ErpRecord, lotSizing = "Lot-for-Lot"): MrpSuggestion[] {
  const gross = new Map<string, { qty: number; type: string; desc: string }>();
  const bump = (item: string, qty: number, type: string, desc: string) => {
    const cur = gross.get(item) ?? { qty: 0, type, desc };
    cur.qty = round3(cur.qty + qty);
    gross.set(item, cur);
  };

  for (const line of plan.lines) {
    const product = byCode("products", line.item);
    const type = product ? str(product, "type") : "Finished Good";
    bump(line.item, line.qty, type || "Finished Good", line.description ?? line.item);
    const bom = approvedBomFor(line.item);
    if (bom) {
      for (const leaf of flattenLeaves(explodeBom(bom, line.qty))) {
        const p = byCode("products", leaf.item);
        bump(leaf.item, leaf.qty, p ? str(p, "type") : "Raw Material", leaf.description);
      }
    }
  }

  const extra = plan.fields.independentDemand;
  if (Array.isArray(extra)) {
    for (const row of extra) {
      const r = row as Record<string, unknown>;
      const item = String(r.item ?? "");
      const p = byCode("products", item);
      bump(item, Number(r.qty ?? 0), p ? str(p, "type") : "Raw Material", p?.title ?? item);
    }
  }

  const period = str(plan, "period") || today().slice(0, 7);
  const needBy = `${period}-04`;

  return Array.from(gross.entries())
    .map(([item, g]) => {
      const product = byCode("products", item);
      const onHand = product ? num(product, "onHand") : 0;
      const allocated = product ? num(product, "reserved") : 0;
      const openPo = openPoQty(item);
      const wip = wipQty(item);
      const net = round3(Math.max(0, g.qty - onHand + allocated - openPo - wip));
      const leadDays = product ? num(product, "leadTimeDays") || 7 : 7;
      const lotQty = lotSize(product, net, lotSizing);
      const isFg = /finished/i.test(g.type);
      let suggest = "None";
      if (net > 0) suggest = isFg ? "Work Order" : "Purchase Requisition";
      return {
        item,
        itemType: g.type,
        gross: g.qty,
        onHand,
        allocated,
        openPo,
        wip,
        net,
        lotQty,
        needBy,
        suggest,
        converted: false,
        leadDays,
      };
    })
    .sort((a, b) => b.net - a.net || a.item.localeCompare(b.item));
}

export async function runMrp(plan: ErpRecord): Promise<ErpRecord> {
  if (plan.status !== "approved" && plan.status !== "completed") {
    throw new Error("Approve the production plan before running MRP.");
  }
  const rows = computeMrp(plan, str(plan, "lotSizing") || "Lot-for-Lot");
  const actionable = rows.filter((r) => r.net > 0).length;
  const run = await getService("mrp_runs").create({
    title: `MRP Run — ${str(plan, "period") || plan.code}`,
    status: "completed",
    fields: {
      plan: plan.code,
      period: str(plan, "period"),
      warehouse: "WH-RM",
      lotSizing: str(plan, "lotSizing") || "Lot-for-Lot",
      suggestions: actionable,
      converted: 0,
      convertedItems: [],
      rows,
    },
  });
  await linkBoth(plan, run);
  logAudit({
    action: "create",
    module: "production",
    entity: "mrp_runs",
    recordId: run.id,
    recordCode: run.code,
    reason: `MRP from ${plan.code}`,
  });
  notify({
    type: "production",
    priority: "normal",
    title: `${run.code} completed`,
    body: `${actionable} net suggestions from ${plan.code}.`,
    module: "production",
    link: { entity: "mrp_runs", id: run.id },
  });
  return run;
}

export async function convertMrpRow(run: ErpRecord, item: string): Promise<ErpRecord> {
  const rows = mrpRowsOf(run);
  const row = rows.find((r) => r.item === item);
  if (!row) throw new Error(`${item} is not on this MRP run.`);
  if (row.converted) throw new Error(`${item} is already converted.`);
  if (row.suggest === "None" || row.lotQty <= 0) throw new Error(`${item} has no net requirement.`);

  let created: ErpRecord;
  if (/work/i.test(row.suggest)) {
    created = await convertMrpToWo(run, row);
  } else {
    created = await convertMrpToPr(run, row);
  }

  const nextRows = rows.map((r) => (r.item === item ? { ...r, converted: true } : r));
  const converted = nextRows.filter((r) => r.converted).length;
  const updated = await getService("mrp_runs").update(run.id, {
    fields: {
      ...run.fields,
      rows: nextRows,
      converted,
      convertedItems: [...(Array.isArray(run.fields.convertedItems) ? (run.fields.convertedItems as string[]) : []), item],
    },
  });
  await linkBoth(updated, created);
  return created;
}

async function convertMrpToPr(run: ErpRecord, row: MrpSuggestion): Promise<ErpRecord> {
  const product = byCode("products", row.item);
  const pr = await getService("purchase_requisitions").create({
    title: `MRP ${row.item}`,
    status: "draft",
    fields: {
      name: `MRP reorder ${row.item}`,
      department: "Production",
      requestedBy: actorName(),
      requiredBy: row.needBy,
      priority: "High",
      justification: `${row.item} net ${row.net.toLocaleString()} after gross ${row.gross.toLocaleString()} − on hand ${row.onHand.toLocaleString()} + allocated ${row.allocated.toLocaleString()} − open PO ${row.openPo.toLocaleString()} − WIP ${row.wip.toLocaleString()}.`,
      source: `MRP ${run.code}`,
    },
    lines: [
      {
        id: newLineId(),
        item: row.item,
        description: product?.title ?? row.item,
        uom: product ? str(product, "uom", "KG") : "KG",
        qty: row.lotQty,
        rate: product ? num(product, "rate") : 0,
        taxPct: product ? num(product, "taxPct") || 13 : 13,
      },
    ],
  });
  notify({
    type: "stock",
    priority: "high",
    title: `PR ${pr.code} from ${run.code}`,
    body: `${row.item} × ${row.lotQty.toLocaleString()}.`,
    module: "purchase",
    link: { entity: "purchase_requisitions", id: pr.id },
  });
  return pr;
}

async function convertMrpToWo(run: ErpRecord, row: MrpSuggestion): Promise<ErpRecord> {
  const product = byCode("products", row.item);
  const bom = approvedBomFor(row.item);
  if (!bom) throw new Error(`No approved BOM for ${row.item}.`);
  const wo = await getService("work_orders").create({
    title: `${product?.title ?? row.item} — ${row.lotQty.toLocaleString()} ${product ? str(product, "uom", "PCS") : "PCS"}`,
    status: "draft",
    fields: {
      product: row.item,
      bom: bom.code,
      plannedQty: row.lotQty,
      producedQty: 0,
      scrapQty: 0,
      machine: "EXT-01",
      supervisor: actorName(),
      plan: str(run, "plan"),
      mrpRun: run.code,
      startDate: row.needBy,
      endDate: row.needBy,
    },
  });
  notify({
    type: "production",
    priority: "normal",
    title: `WO ${wo.code} from ${run.code}`,
    body: `${row.item} planned ${row.lotQty.toLocaleString()}.`,
    module: "production",
    link: { entity: "work_orders", id: wo.id },
  });
  return wo;
}

export async function replanPlan(plan: ErpRecord, reason = "Shortage / breakdown re-plan"): Promise<ErpRecord> {
  const version = str(plan, "version") || "v1";
  const n = Number(version.replace(/\D/g, "")) || 1;
  const next = await getService("production_plans").create({
    title: `${plan.title.replace(/ \(re-plan.*\)$/, "")} (re-plan)`,
    status: "draft",
    fields: {
      ...plan.fields,
      name: `${str(plan, "name") || plan.title} (re-plan)`,
      version: `v${n + 1}`,
      previousVersion: plan.code,
      replanReason: reason,
      planner: actorName(),
    },
    lines: cloneLines(plan.lines),
  });
  await linkBoth(plan, next);
  notify({
    type: "production",
    priority: "normal",
    title: `${next.code} drafted`,
    body: reason,
    module: "production",
    link: { entity: "production_plans", id: next.id },
  });
  return next;
}

export async function rollBomCost(bom: ErpRecord): Promise<ErpRecord> {
  const unitCost = rolledCost(bom);
  return getService("boms").update(bom.id, { fields: { ...bom.fields, unitCost, rolledAt: today() } });
}

export async function releaseWorkOrder(wo: ErpRecord): Promise<ErpRecord> {
  if (wo.status !== "draft" && wo.status !== "approved") {
    throw new Error("Only a draft or approved work order can be released.");
  }
  return getService("work_orders").transition(wo.id, "released", "Released to the shop floor");
}

async function bumpProduct(code: string, deltaOnHand: number, deltaReserved = 0) {
  const p = byCode("products", code);
  if (!p) return;
  const updated = await getService("products").update(p.id, {
    fields: {
      ...p.fields,
      onHand: Math.max(0, num(p, "onHand") + deltaOnHand),
      reserved: Math.max(0, num(p, "reserved") + deltaReserved),
    },
  });
  await syncReorderAlert(updated);
}

async function movement(type: string, item: string, qty: number, warehouse: string, reference: string) {
  await getService("stock_movements").create({
    title: `${type} — ${item}`,
    status: "completed",
    fields: { type, product: item, qty, warehouse, reference, by: actorName() },
  });
}

function issueLinesFor(wo: ErpRecord): LineItem[] {
  const bom = byCode("boms", str(wo, "bom")) ?? approvedBomFor(str(wo, "product"));
  if (!bom) throw new Error(`No BOM on ${wo.code}.`);
  const qty = num(wo, "plannedQty") || 1;
  const leaves = flattenLeaves(explodeBom(bom, qty));
  const grouped = new Map<string, BomNode>();
  for (const leaf of leaves) {
    const cur = grouped.get(leaf.item);
    if (cur) cur.qty = round3(cur.qty + leaf.qty);
    else grouped.set(leaf.item, { ...leaf, children: [] });
  }
  return Array.from(grouped.values()).map((n) => {
    const product = byCode("products", n.item);
    let item = n.item;
    let description = n.description;
    let rate = n.rate;
    if (product && num(product, "onHand") + 0.0001 < n.qty && n.substitute) {
      const sub = byCode("products", n.substitute);
      if (sub && num(sub, "onHand") >= n.qty) {
        item = n.substitute;
        description = `${sub.title} (substitute for ${n.item})`;
        rate = num(sub, "rate") || n.rate;
      }
    }
    return {
      id: newLineId(),
      item,
      description,
      uom: n.uom,
      qty: n.qty,
      rate,
      warehouse: "WH-RM",
    };
  });
}

export async function issueMaterials(wo: ErpRecord, mode: "Manual" | "Backflush" = "Manual"): Promise<ErpRecord> {
  if (!["released", "in_progress"].includes(wo.status)) {
    throw new Error("Release the work order before issuing material.");
  }
  const existing = (db.get().records.material_issues ?? []).find(
    (mi) => str(mi, "workOrder") === wo.code && mi.status === "completed",
  );
  if (existing) throw new Error(`${wo.code} already has material issue ${existing.code}.`);

  const lines = issueLinesFor(wo);
  for (const line of lines) {
    const product = byCode("products", line.item);
    if (product && num(product, "onHand") + 0.0001 < line.qty) {
      throw new Error(`Insufficient ${line.item}: need ${line.qty}, on hand ${num(product, "onHand")}.`);
    }
  }
  for (const line of lines) {
    const product = byCode("products", line.item);
    const reservedCut = product ? -Math.min(num(product, "reserved"), line.qty) : 0;
    await bumpProduct(line.item, -line.qty, reservedCut);
    await movement("Issue", line.item, -line.qty, "WH-RM", wo.code);
  }

  const mi = await getService("material_issues").create({
    title: `Material Issue — ${wo.code}`,
    status: "completed",
    fields: { workOrder: wo.code, warehouse: "WH-RM", issuedBy: actorName(), mode },
    lines,
  });
  const nextWo =
    wo.status === "released"
      ? await getService("work_orders").transition(wo.id, "in_progress", `${mode} issue ${mi.code}`)
      : await getService("work_orders").get(wo.id);
  if (nextWo) await linkBoth(nextWo, mi);
  notify({
    type: "production",
    priority: "normal",
    title: `${mi.code} issued`,
    body: `${lines.length} components to ${wo.code} (${mode}).`,
    module: "production",
    link: { entity: "material_issues", id: mi.id },
  });
  return (await getService("work_orders").get(wo.id)) ?? nextWo ?? wo;
}

export async function startOperationFor(woCode: string, workCentre = "Extrusion"): Promise<ErpRecord> {
  const wo = byCode("work_orders", woCode);
  if (!wo) throw new Error(`Work order ${woCode} not found.`);
  return startOperation(wo, workCentre);
}

export async function startOperation(wo: ErpRecord, workCentre = "Extrusion"): Promise<ErpRecord> {
  if (!["released", "in_progress"].includes(wo.status)) {
    throw new Error("Release the work order before starting an operation.");
  }
  const ops = db.get().records.operations ?? [];
  let op =
    ops.find((o) => str(o, "workOrder") === wo.code && o.status === "hold") ??
    ops.find((o) => str(o, "workOrder") === wo.code && o.status === "draft") ??
    ops.find((o) => str(o, "workOrder") === wo.code && o.status === "in_progress");
  if (op?.status === "in_progress") throw new Error(`${op.code} is already running.`);
  if (!op) {
    op = await getService("operations").create({
      title: `${workCentre} — ${wo.code}`,
      status: "draft",
      fields: {
        workOrder: wo.code,
        workCentre,
        machine: str(wo, "machine") || "EXT-01",
        operator: actorName(),
        plannedHrs: 8,
        actualHrs: 0,
        outputQty: 0,
        scrap: 0,
        rework: 0,
        downtimeMins: 0,
      },
    });
  }
  const patched = await getService("operations").update(op.id, {
    fields: { ...op.fields, operator: actorName(), machine: str(op, "machine") || str(wo, "machine") || "EXT-01", startedAt: new Date().toISOString() },
  });
  const running = patched.status === "hold"
    ? await getService("operations").transition(patched.id, "in_progress", "Resumed")
    : await getService("operations").transition(patched.id, "in_progress", "Started");
  if (wo.status === "released") {
    await getService("work_orders").transition(wo.id, "in_progress", `Operation ${running.code} started`);
  }
  await linkBoth(wo, running);
  return running;
}

export async function pauseOperation(op: ErpRecord, reason: string = "Breakdown"): Promise<ErpRecord> {
  if (op.status !== "in_progress") throw new Error("Only a running operation can be paused.");
  const updated = await getService("operations").update(op.id, {
    fields: { ...op.fields, downtimeReason: reason, pausedAt: new Date().toISOString() },
  });
  return getService("operations").transition(updated.id, "hold", reason);
}

export async function completeOperation(
  op: ErpRecord,
  opts?: { outputQty?: number; scrap?: number; rework?: number; downtimeMins?: number; reason?: string; actualHrs?: number },
): Promise<ErpRecord> {
  if (op.status !== "in_progress" && op.status !== "hold") {
    throw new Error("Start the operation before completing it.");
  }
  const wo = byCode("work_orders", str(op, "workOrder"));
  const outputQty = opts?.outputQty ?? (wo ? num(wo, "plannedQty") : num(op, "outputQty"));
  const scrap = opts?.scrap ?? 80;
  const patched = await getService("operations").update(op.id, {
    fields: {
      ...op.fields,
      outputQty,
      scrap,
      rework: opts?.rework ?? num(op, "rework"),
      downtimeMins: opts?.downtimeMins ?? 15,
      downtimeReason: opts?.reason ?? str(op, "downtimeReason") ?? "Changeover",
      actualHrs: opts?.actualHrs ?? 8.5,
      completedAt: new Date().toISOString(),
    },
  });
  const done = patched.status === "hold"
    ? await getService("operations").transition(patched.id, "completed", opts?.reason ?? "Completed from pause")
    : await getService("operations").transition(patched.id, "completed", "Operation stopped");
  if (wo) {
    await getService("work_orders").update(wo.id, {
      fields: { ...wo.fields, producedQty: outputQty, scrapQty: scrap },
    });
  }
  return done;
}

export async function receiveFgBatch(wo: ErpRecord): Promise<ErpRecord> {
  const live = byCode("work_orders", wo.code) ?? wo;
  if (!["released", "in_progress"].includes(live.status)) {
    throw new Error("Receive finished goods from a released or in-progress work order.");
  }
  const issued = (db.get().records.material_issues ?? []).some(
    (mi) => str(mi, "workOrder") === live.code && mi.status === "completed",
  );
  if (!issued) await issueMaterials(live, "Backflush");
  const fresh = byCode("work_orders", live.code) ?? live;
  const qty = num(fresh, "producedQty") || num(fresh, "plannedQty");
  const product = str(fresh, "product");
  const batch = await getService("batches").create({
    title: `FG Batch — ${product}`,
    status: "released",
    fields: {
      product,
      workOrder: fresh.code,
      qty,
      mfgDate: today(),
      expiry: `${Number(today().slice(0, 4)) + 2}${today().slice(4)}`,
      qcStatus: "Pending",
      location: "WH-FG / A-01-01",
    },
  });
  await bumpProduct(product, qty);
  await movement("Production Receipt", product, qty, "WH-FG", fresh.code);
  const updated = await getService("work_orders").update(fresh.id, {
    fields: { ...fresh.fields, producedQty: qty, batch: batch.code },
  });
  const completed = updated.status === "completed"
    ? updated
    : await getService("work_orders").transition(updated.id, "completed", `FG batch ${batch.code}`);
  await linkBoth(completed, batch);
  notify({
    type: "production",
    priority: "normal",
    title: `${batch.code} received`,
    body: `${qty.toLocaleString()} ${product} from ${completed.code}.`,
    module: "production",
    link: { entity: "batches", id: batch.id },
  });
  return completed;
}

export function woCosting(wo: ErpRecord) {
  const bom = byCode("boms", str(wo, "bom")) ?? approvedBomFor(str(wo, "product"));
  const produced = num(wo, "producedQty") || num(wo, "plannedQty");
  const standardUnit = bom ? num(bom, "unitCost") || rolledCost(bom) : 0;
  const standard = round3(standardUnit * produced);
  const issues = (db.get().records.material_issues ?? []).filter((mi) => str(mi, "workOrder") === wo.code);
  const material = issues.reduce((s, mi) => s + mi.lines.reduce((a, l) => a + l.qty * l.rate, 0), 0);
  const ops = (db.get().records.operations ?? []).filter((o) => str(o, "workOrder") === wo.code);
  const labour = ops.reduce((s, o) => s + num(o, "actualHrs") * LABOUR_RATE, 0);
  const actual = round3(material + labour);
  return {
    produced,
    standardUnit,
    standard,
    material: round3(material),
    labour: round3(labour),
    actual,
    variance: round3(actual - standard),
  };
}

export async function closeWorkOrder(wo: ErpRecord): Promise<ErpRecord> {
  const live = byCode("work_orders", wo.code) ?? wo;
  if (live.status !== "completed") throw new Error("Complete and receive the work order before closing costing.");
  const cost = woCosting(live);
  const patched = await getService("work_orders").update(live.id, {
    fields: {
      ...live.fields,
      standardCost: cost.standard,
      actualCost: cost.actual,
      materialCost: cost.material,
      labourCost: cost.labour,
      variance: cost.variance,
      closedAt: today(),
    },
  });
  const closed = await getService("work_orders").transition(patched.id, "closed", `Variance NPR ${cost.variance.toLocaleString()}`);
  notify({
    type: "production",
    priority: cost.variance > 0 ? "high" : "normal",
    title: `${closed.code} closed`,
    body: `Standard ${cost.standard.toLocaleString()} vs actual ${cost.actual.toLocaleString()} (variance ${cost.variance.toLocaleString()}).`,
    module: "production",
    link: { entity: "work_orders", id: closed.id },
  });
  return closed;
}

export function slotsOf(schedule: ErpRecord): ScheduleSlot[] {
  const raw = schedule.fields.slots;
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const row = s as Record<string, unknown>;
    return {
      machine: String(row.machine ?? ""),
      workOrder: String(row.workOrder ?? ""),
      start: String(row.start ?? ""),
      end: String(row.end ?? ""),
      setupMins: Number(row.setupMins ?? 0),
    };
  });
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  if ([a0, a1, b0, b1].some((n) => Number.isNaN(n))) return false;
  return a0 < b1 && b0 < a1;
}

export function detectConflicts(schedule: ErpRecord): SlotConflict[] {
  const slots = slotsOf(schedule);
  const conflicts: SlotConflict[] = [];
  slots.forEach((slot, i) => {
    slots.forEach((other, j) => {
      if (j <= i) return;
      if (slot.machine === other.machine && overlaps(slot.start, slot.end, other.start, other.end)) {
        conflicts.push({
          index: i,
          machine: slot.machine,
          workOrder: slot.workOrder,
          reason: `Overlaps ${other.workOrder} on ${slot.machine}`,
        });
      }
    });
    const machine = byCode("machines", slot.machine);
    const windows = Array.isArray(machine?.fields.maintenanceWindows)
      ? (machine!.fields.maintenanceWindows as Array<{ start: string; end: string }>)
      : [];
    for (const win of windows) {
      if (overlaps(slot.start, slot.end, win.start, win.end)) {
        conflicts.push({
          index: i,
          machine: slot.machine,
          workOrder: slot.workOrder,
          reason: `Maintenance window ${win.start.slice(0, 16)}–${win.end.slice(11, 16)}`,
        });
      }
    }
  });
  return conflicts;
}

function shiftIso(iso: string, hours: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function shiftScheduleSlot(schedule: ErpRecord, index: number, hours: number): Promise<ErpRecord> {
  const slots = slotsOf(schedule);
  const slot = slots[index];
  if (!slot) throw new Error("Unknown schedule slot.");
  slots[index] = { ...slot, start: shiftIso(slot.start, hours), end: shiftIso(slot.end, hours) };
  const updated = await getService("machine_schedules").update(schedule.id, {
    fields: { ...schedule.fields, slots },
  });
  const conflicts = detectConflicts(updated);
  logAudit({
    action: "edit",
    module: "production",
    entity: "machine_schedules",
    recordId: updated.id,
    recordCode: updated.code,
    after: { slot: index, hours, conflicts: conflicts.length },
    reason: `Shifted slot ${index + 1} by ${hours}h`,
  });
  return updated;
}
