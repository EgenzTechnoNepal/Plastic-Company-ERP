import { getService } from "@/services/catalog";
import { logAudit, notify } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { num, str } from "@/lib/records";
import { useAuthStore } from "@/store/auth";
import type { ErpRecord } from "@/types/erp";

export const CAPA_STAGES = [
  "Containment",
  "Root Cause",
  "Corrective Action",
  "Preventive Action",
  "Effectiveness",
  "Closure",
] as const;

export interface QcCheck {
  parameter: string;
  expected: string;
  observed: string;
  result: string;
  instrument?: string;
}

export interface PlanSpec {
  parameter: string;
  expected: string;
  instrument?: string;
}

function byCode(entity: string, code: string) {
  return (db.get().records[entity] ?? []).find((r) => r.code === code || r.id === code);
}

function actorName() {
  return useAuthStore.getState().user?.name ?? "QC Lead";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function linkBoth(a: ErpRecord, b: ErpRecord) {
  await getService(a.entity).link(a.id, { entity: b.entity, id: b.id, label: b.code });
  await getService(b.entity).link(b.id, { entity: a.entity, id: a.id, label: a.code });
}

export function checksOf(qc: ErpRecord): QcCheck[] {
  const raw = qc.fields.checks;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      parameter: String(r.parameter ?? ""),
      expected: String(r.expected ?? ""),
      observed: String(r.observed ?? ""),
      result: String(r.result ?? "Pending"),
      instrument: r.instrument ? String(r.instrument) : undefined,
    };
  });
}

export function specOf(plan: ErpRecord): PlanSpec[] {
  const raw = plan.fields.spec;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        parameter: String(r.parameter ?? ""),
        expected: String(r.expected ?? ""),
        instrument: r.instrument ? String(r.instrument) : undefined,
      };
    });
  }
  const text = str(plan, "parameters");
  if (!text) return [];
  return text.split(/[,;]/).map((p) => ({ parameter: p.trim(), expected: "Within spec" })).filter((s) => s.parameter);
}

export function planForInspection(qc: ErpRecord): ErpRecord | undefined {
  const coded = str(qc, "qualityPlan");
  if (coded) return byCode("quality_plans", coded);
  const product = str(qc, "product");
  const stage = str(qc, "stage");
  return (db.get().records.quality_plans ?? []).find(
    (p) => str(p, "product") === product && (!stage || str(p, "stage") === stage || (stage === "Final" && str(p, "stage") === "Final")),
  );
}

function fillChecks(qc: ErpRecord, result: "Pass" | "Fail"): QcCheck[] {
  const existing = checksOf(qc);
  const plan = planForInspection(qc);
  const specs = existing.length ? existing : specOf(plan ?? ({ fields: {} } as ErpRecord));
  const rows = specs.length ? specs : [{ parameter: "Visual", expected: "No defects", observed: "", result: "Pending" }];
  return rows.map((c, i) => {
    const failLast = result === "Fail" && i === rows.length - 1;
    const prior = "observed" in c ? String(c.observed ?? "") : "";
    const observed = prior || (failLast ? "Out of spec" : c.expected.replace(/^>/, "").trim() || "OK");
    return {
      parameter: c.parameter,
      expected: c.expected,
      observed,
      result: failLast ? "Fail" : "Pass",
      instrument: "instrument" in c ? c.instrument : undefined,
    };
  });
}

async function setBatchQc(code: string, status: "hold" | "released", qcStatus: string) {
  const batch = byCode("batches", code);
  if (!batch) return;
  await getService("batches").update(batch.id, {
    status,
    fields: { ...batch.fields, qcStatus },
  });
}

export async function completeInspection(qc: ErpRecord, result: "Pass" | "Fail"): Promise<ErpRecord> {
  if (!["draft", "submitted", "hold"].includes(qc.status)) {
    throw new Error("This inspection is already closed.");
  }
  const checks = fillChecks(qc, result);
  const defects = checks.filter((c) => c.result === "Fail").length;
  const disposition = result === "Pass" ? "Release" : "Hold";
  const patched = await getService("qc_inspections").update(qc.id, {
    fields: {
      ...qc.fields,
      result,
      defects,
      disposition,
      inspector: actorName(),
      checks,
      inspectedAt: today(),
    },
  });
  const nextStatus = result === "Pass" ? "approved" : "hold";
  const done = patched.status === nextStatus
    ? patched
    : await getService("qc_inspections").transition(patched.id, nextStatus, `${result} — ${defects} defect(s)`);

  const batch = str(done, "batch");
  if (batch) await setBatchQc(batch, result === "Pass" ? "released" : "hold", result === "Pass" ? "Passed" : "Failed");

  if (result === "Fail") {
    const qty = num(done, "sampleSize") || 1;
    const hold = await getService("quarantine").create({
      title: `Hold — ${str(done, "product")} ${batch || done.code}`,
      status: "hold",
      fields: {
        product: str(done, "product"),
        batch,
        qty,
        source: `${str(done, "stage")} QC`,
        reason: checks.filter((c) => c.result === "Fail").map((c) => c.parameter).join(", ") || "Inspection failed",
        warehouse: "WH-QR",
        inspection: done.code,
      },
    });
    await linkBoth(done, hold);
    notify({
      type: "quality",
      priority: "high",
      title: `${done.code} failed — ${hold.code}`,
      body: `${str(done, "product")} held in quarantine.`,
      module: "quality-control",
      link: { entity: "quarantine", id: hold.id },
    });
  } else {
    notify({
      type: "quality",
      priority: "normal",
      title: `${done.code} passed`,
      body: `${str(done, "stage")} inspection released.`,
      module: "quality-control",
      link: { entity: "qc_inspections", id: done.id },
    });
  }
  return (await getService("qc_inspections").get(done.id)) ?? done;
}

export async function releaseQuarantine(hold: ErpRecord): Promise<ErpRecord> {
  if (hold.status !== "hold") throw new Error("Only an open hold can be released.");
  const released = await getService("quarantine").transition(hold.id, "released", "Released from quarantine");
  const batch = str(released, "batch");
  if (batch) await setBatchQc(batch, "released", "Passed");
  const qcCode = str(released, "inspection");
  const qc = qcCode ? byCode("qc_inspections", qcCode) : undefined;
  if (qc && qc.status === "hold") {
    await getService("qc_inspections").update(qc.id, {
      fields: { ...qc.fields, disposition: "Release", result: str(qc, "result") || "Pass" },
    });
    await getService("qc_inspections").transition(qc.id, "approved", "Hold released");
  }
  notify({
    type: "quality",
    priority: "normal",
    title: `${released.code} released`,
    body: `${str(released, "product")} ${batch} is available again.`,
    module: "quality-control",
    link: { entity: "quarantine", id: released.id },
  });
  return released;
}

export async function raiseNcrFrom(source: ErpRecord): Promise<ErpRecord> {
  const isQc = source.entity === "qc_inspections";
  const isHold = source.entity === "quarantine";
  if (!isQc && !isHold) throw new Error("Raise an NCR from an inspection or quarantine hold.");
  const existing = str(source, "ncr");
  if (existing) throw new Error(`NCR ${existing} is already linked.`);
  const product = str(source, "product");
  const batch = str(source, "batch");
  const ncr = await getService("ncrs").create({
    title: isQc ? `NC from ${source.code}` : `Quarantine ${source.code}`,
    status: "open",
    fields: {
      name: isQc ? `NC from ${source.code}` : `Quarantine ${source.code}`,
      source: "Inspection",
      reference: source.code,
      severity: "Major",
      product,
      batch,
      problem: isQc
        ? checksOf(source).filter((c) => c.result === "Fail").map((c) => `${c.parameter}: ${c.observed}`).join("; ") || "Inspection failed"
        : str(source, "reason"),
      disposition: "Rework",
      costImpact: isQc ? 25000 : 18000,
      raisedBy: actorName(),
    },
  });
  await getService(source.entity).update(source.id, { fields: { ...source.fields, ncr: ncr.code } });
  await linkBoth(source, ncr);
  notify({
    type: "quality",
    priority: "high",
    title: `${ncr.code} raised`,
    body: `${product} ${batch} — ${str(ncr, "problem")}`,
    module: "quality-control",
    link: { entity: "ncrs", id: ncr.id },
  });
  return ncr;
}

export async function raiseCapaFromNcr(ncr: ErpRecord): Promise<ErpRecord> {
  if (str(ncr, "capa")) throw new Error(`CAPA ${str(ncr, "capa")} is already linked.`);
  const due = new Date();
  due.setDate(due.getDate() + 21);
  const capa = await getService("capas").create({
    title: `CAPA — ${ncr.title}`,
    status: "open",
    fields: {
      name: `CAPA — ${ncr.title}`,
      ncr: ncr.code,
      owner: actorName(),
      dueDate: due.toISOString().slice(0, 10),
      stage: "Containment",
      containment: "Isolate affected batch and stop the line until root cause is confirmed.",
    },
  });
  const patched = await getService("ncrs").update(ncr.id, { fields: { ...ncr.fields, capa: capa.code } });
  if (patched.status === "open") {
    await getService("ncrs").transition(patched.id, "in_progress", `CAPA ${capa.code}`);
  }
  await linkBoth(patched, capa);
  notify({
    type: "quality",
    priority: "normal",
    title: `${capa.code} opened`,
    body: `From ${ncr.code}. Containment is the first stage.`,
    module: "quality-control",
    link: { entity: "capas", id: capa.id },
  });
  return capa;
}

export async function advanceCapa(capa: ErpRecord): Promise<ErpRecord> {
  const stage = str(capa, "stage") || "Containment";
  const idx = CAPA_STAGES.indexOf(stage as (typeof CAPA_STAGES)[number]);
  if (idx < 0 || idx >= CAPA_STAGES.length - 1) throw new Error("CAPA is already at closure. Verify effectiveness to close.");
  const next = CAPA_STAGES[idx + 1];
  const fields: Record<string, unknown> = { ...capa.fields, stage: next };
  if (next === "Root Cause" && !str(capa, "rootCause")) fields.rootCause = "To be confirmed on the line.";
  if (next === "Corrective Action" && !str(capa, "correctiveAction")) fields.correctiveAction = "Correct the immediate cause and re-inspect.";
  if (next === "Preventive Action" && !str(capa, "preventiveAction")) fields.preventiveAction = "Add the check to the quality plan and calibration roster.";
  const patched = await getService("capas").update(capa.id, { fields });
  if (patched.status === "open") {
    return getService("capas").transition(patched.id, "in_progress", `Stage → ${next}`);
  }
  logAudit({
    action: "edit",
    module: "quality-control",
    entity: "capas",
    recordId: patched.id,
    recordCode: patched.code,
    after: { stage: next },
    reason: `Advanced to ${next}`,
  });
  return patched;
}

export async function closeCapa(capa: ErpRecord, evidence = "Re-inspection passed. No recurrence in the following lot."): Promise<ErpRecord> {
  const patched = await getService("capas").update(capa.id, {
    fields: {
      ...capa.fields,
      stage: "Closure",
      effectiveness: evidence,
      closedAt: today(),
      evidence,
    },
  });
  let closed = patched;
  if (closed.status !== "completed" && closed.status !== "closed") {
    if (closed.status === "open") closed = await getService("capas").transition(closed.id, "in_progress", "Effectiveness verified");
    if (closed.status === "in_progress") closed = await getService("capas").transition(closed.id, "completed", evidence);
  }
  if (closed.status === "completed") {
    closed = await getService("capas").transition(closed.id, "closed", "Effectiveness closure");
  }
  const ncrCode = str(closed, "ncr");
  const ncr = ncrCode ? byCode("ncrs", ncrCode) : undefined;
  if (ncr && ncr.status !== "closed" && ncr.status !== "cancelled") {
    if (ncr.status === "open" || ncr.status === "in_progress") {
      await getService("ncrs").transition(ncr.id, "closed", `CAPA ${closed.code} effective`);
    }
  }
  notify({
    type: "quality",
    priority: "normal",
    title: `${closed.code} closed`,
    body: evidence,
    module: "quality-control",
    link: { entity: "capas", id: closed.id },
  });
  return closed;
}

export async function issueCoa(qc: ErpRecord): Promise<ErpRecord> {
  if (str(qc, "result") !== "Pass" && qc.status !== "approved") {
    throw new Error("Issue a CoA only from a passed inspection.");
  }
  if (str(qc, "coa")) throw new Error(`CoA ${str(qc, "coa")} already exists.`);
  if (str(qc, "stage") !== "Final" && str(qc, "stage") !== "Incoming") {
    throw new Error("CoA is issued from incoming or final inspection.");
  }
  const coa = await getService("certificates").create({
    title: `CoA — ${str(qc, "product")} ${str(qc, "batch") || qc.code}`,
    status: "completed",
    fields: {
      name: `Certificate of Analysis — ${str(qc, "product")}`,
      inspection: qc.code,
      product: str(qc, "product"),
      batch: str(qc, "batch"),
      result: "Pass",
      issuedTo: str(qc, "stage") === "Incoming" ? "Stores" : "Customer / FG store",
      issuedBy: actorName(),
      standard: "ISO 17088",
    },
  });
  await getService("qc_inspections").update(qc.id, { fields: { ...qc.fields, coa: coa.code } });
  await linkBoth(qc, coa);
  notify({
    type: "quality",
    priority: "normal",
    title: `${coa.code} issued`,
    body: `ISO 17088 CoA for ${str(qc, "product")}.`,
    module: "quality-control",
    link: { entity: "certificates", id: coa.id },
  });
  return coa;
}

export async function recordCalibration(ins: ErpRecord): Promise<ErpRecord> {
  const next = new Date();
  next.setMonth(next.getMonth() + 6);
  const updated = await getService("instruments").update(ins.id, {
    fields: {
      ...ins.fields,
      lastCalibration: today(),
      nextCalibration: next.toISOString().slice(0, 10),
      status: "Calibrated",
      calibratedBy: actorName(),
    },
  });
  logAudit({
    action: "edit",
    module: "quality-control",
    entity: "instruments",
    recordId: updated.id,
    recordCode: updated.code,
    after: { lastCalibration: today() },
    reason: "Calibration recorded",
  });
  return updated;
}

export function supplierQuality(supplier: ErpRecord) {
  const pos = (db.get().records.purchase_orders ?? []).filter((po) => str(po, "supplier") === supplier.code);
  const items = new Set(pos.flatMap((po) => po.lines.map((l) => l.item)));
  const grns = (db.get().records.grns ?? []).filter((g) => pos.some((po) => po.code === str(g, "purchaseOrder")));
  const incoming = (db.get().records.qc_inspections ?? []).filter((qc) => {
    if (str(qc, "stage") !== "Incoming") return false;
    if (items.has(str(qc, "product"))) return true;
    return grns.some((g) => g.code === str(qc, "reference"));
  });
  const returns = (db.get().records.purchase_returns ?? []).filter((r) => str(r, "supplier") === supplier.code && r.status !== "cancelled");
  const passed = incoming.filter((q) => str(q, "result") === "Pass").length;
  const failed = incoming.filter((q) => str(q, "result") === "Fail").length;
  const total = incoming.length;
  const passPct = total ? Math.round((passed / total) * 100) : 100;
  const returnPenalty = Math.min(40, returns.length * 8);
  const score = Math.max(0, Math.min(100, passPct - returnPenalty));
  return { incoming: total, passed, failed, returns: returns.length, passPct, score };
}

export function instrumentOverdue(ins: ErpRecord, asOf = today()) {
  const next = str(ins, "nextCalibration");
  return Boolean(next && next < asOf);
}
