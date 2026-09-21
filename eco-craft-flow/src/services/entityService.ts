/**
 * Generic repository/service factory over the mock DB.
 * Swap the bodies for `apiFetch()` calls to Django REST later — the public
 * surface (list/get/create/update/remove/submit/approve/reject/cancel/post/reverse) stays.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDb, db } from "@/services/mock/db";
import type { ApprovalRequest, ApprovalRule, AuditEvent, DocStatus, ErpRecord, LineItem, NotificationItem } from "@/types/erp";
import { docTotals } from "@/types/erp";
import { isLiveSession, useAuthStore } from "@/store/auth";
import { getEntity } from "@/features/registry/entities";
import { approveTarget, assertTransition, returnTarget, submitTarget } from "@/features/records/workflow";
import { dueDateFromHours, rulesFor } from "@/features/workflow/approvals";
import {
  createRecord,
  deleteRecord,
  getRecord,
  isMissingResource,
  listRecords,
  recordAction,
  RECORD_PATHS,
  updateRecord,
} from "@/services/api/records";
import { fetchAuditLogs } from "@/services/api/audit";

const now = () => new Date().toISOString();
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const EMPTY_RECORDS: ErpRecord[] = [];

function actor() {
  const u = useAuthStore.getState().user;
  return { name: u?.name ?? "Guest", role: u?.role ?? "guest" };
}

export function logAudit(e: Omit<AuditEvent, "id" | "at" | "user" | "role" | "ip">) {
  const a = actor();
  const event: AuditEvent = { id: rid("aud"), at: now(), user: a.name, role: a.role, ip: "10.0.0.24", ...e };
  db.set((s) => ({ audit: [event, ...s.audit].slice(0, 800) }));
}

export function notify(n: Omit<NotificationItem, "id" | "at" | "read">) {
  db.set((s) => ({ notifications: [{ id: rid("n"), at: now(), read: false, ...n }, ...s.notifications].slice(0, 300) }));
}

export function nextCode(entity: string): string {
  const def = getEntity(entity);
  const prefix = def?.prefix ?? entity.slice(0, 3).toUpperCase();
  const rows = db.get().records[entity] ?? [];
  const nums = rows
    .map((r) => Number(r.code.replace(/\D+/g, "").slice(-4)))
    .filter((x) => !Number.isNaN(x));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

export function recordTotal(r: ErpRecord): number {
  if (r.lines?.length) {
    const isLedger = r.lines.some((l) => l.debit !== undefined || l.credit !== undefined);
    if (isLedger) return r.lines.reduce((s, l) => s + (l.debit || 0), 0);
    return docTotals(r.lines).total;
  }
  const f = r.fields as Record<string, unknown>;
  const cand = ["amount", "total", "value", "net", "expectedValue", "cost"].map((k) => f[k]).find((v) => typeof v === "number");
  return (cand as number) ?? 0;
}

export interface ServiceOptions {
  module: string;
}

function liveEnabled(entity: string): boolean {
  return isLiveSession() && Boolean(RECORD_PATHS[entity]);
}

export function createEntityService(entity: string, opts: ServiceOptions = { module: entity }) {
  const rows = () => db.get().records[entity] ?? [];
  const write = (next: ErpRecord[]) => db.get().setRecords(entity, next);

  const svc = {
    entity,
    async list(): Promise<ErpRecord[]> {
      if (liveEnabled(entity)) {
        try {
          return await listRecords(entity);
        } catch (err) {
          if (!isMissingResource(err)) throw err;
        }
      }
      return rows();
    },
    async get(id: string): Promise<ErpRecord | undefined> {
      if (liveEnabled(entity)) {
        try {
          return await getRecord(entity, id);
        } catch (err) {
          if (!isMissingResource(err)) {
            const local = rows().find((r) => r.id === id || r.code === id);
            if (local) return local;
            throw err;
          }
        }
      }
      return rows().find((r) => r.id === id || r.code === id);
    },
    async create(data: Partial<ErpRecord>): Promise<ErpRecord> {
      const a = actor();
      const code = data.code || nextCode(entity);
      const def = getEntity(entity);
      const status = (data.status ?? def?.statuses?.[0] ?? "draft") as DocStatus;
      const prepared: Partial<ErpRecord> = {
        ...data,
        code,
        title: data.title || String(data.fields?.["customerName"] ?? data.fields?.["name"] ?? code),
        date: data.date || now().slice(0, 10),
        status,
        fields: data.fields ?? {},
        lines: data.lines ?? [],
      };
      if (liveEnabled(entity)) {
        try {
          const created = await createRecord(entity, prepared);
          write([created, ...rows().filter((r) => r.id !== created.id)]);
          return created;
        } catch (err) {
          if (!isMissingResource(err)) throw err;
        }
      }
      const record: ErpRecord = {
        id: `${entity}:${code}`,
        entity,
        code,
        title: prepared.title ?? code,
        date: prepared.date ?? now().slice(0, 10),
        status,
        fields: prepared.fields ?? {},
        lines: prepared.lines ?? [],
        history: [{ id: rid("h"), status, by: a.name, at: now(), comment: "Created" }],
        links: data.links ?? [],
        createdAt: now(),
        updatedAt: now(),
      };
      write([record, ...rows()]);
      logAudit({ action: "create", module: opts.module, entity, recordId: record.id, recordCode: code, after: record.fields });
      return record;
    },
    async update(id: string, patch: Partial<ErpRecord>): Promise<ErpRecord> {
      const before = await svc.get(id);
      if (!before) throw new Error("Record not found");
      const updated: ErpRecord = {
        ...before,
        ...patch,
        fields: { ...before.fields, ...(patch.fields ?? {}) },
        lines: patch.lines ?? before.lines,
        updatedAt: now(),
      };
      if (liveEnabled(entity)) {
        try {
          const saved = await updateRecord(entity, before.id, updated);
          write(rows().map((r) => (r.id === before.id || r.code === before.code ? saved : r)));
          return saved;
        } catch (err) {
          if (!isMissingResource(err)) throw err;
        }
      }
      write(rows().map((r) => (r.id === before.id ? updated : r)));
      logAudit({ action: "edit", module: opts.module, entity, recordId: before.id, recordCode: before.code, before: before.fields, after: updated.fields });
      return updated;
    },
    async remove(id: string, reason?: string): Promise<void> {
      const before = await svc.get(id);
      if (!before) return;
      if (liveEnabled(entity)) {
        try {
          await deleteRecord(entity, before.id);
        } catch (err) {
          if (!isMissingResource(err)) throw err;
        }
      }
      write(rows().filter((r) => r.id !== before.id));
      logAudit({ action: "delete", module: opts.module, entity, recordId: before.id, recordCode: before.code, before: before.fields, reason });
    },
    async transition(id: string, status: DocStatus, comment?: string): Promise<ErpRecord> {
      const before = await svc.get(id);
      if (!before) throw new Error("Record not found");
      const def = getEntity(entity);
      if (def) assertTransition(before.status, status, def);
      if (liveEnabled(entity)) {
        const actionByStatus: Partial<Record<DocStatus, string>> = {
          pending_approval: "submit",
          submitted: "submit",
          approved: "approve",
          rejected: "reject",
          cancelled: "cancel",
          posted: "post",
          reversed: "reverse",
        };
        const action = actionByStatus[status];
        if (action) {
          try {
            return await recordAction(entity, before.id, action, { comment, reason: comment, status });
          } catch (err) {
            if (!isMissingResource(err)) throw err;
          }
        }
      }
      const a = actor();
      const updated: ErpRecord = {
        ...before,
        status,
        updatedAt: now(),
        history: [...before.history, { id: rid("h"), status, by: a.name, at: now(), comment }],
      };
      write(rows().map((r) => (r.id === before.id ? updated : r)));
      logAudit({
        action: status, module: opts.module, entity, recordId: before.id, recordCode: before.code,
        before: { status: before.status }, after: { status }, reason: comment,
      });
      return updated;
    },
    async submit(id: string, comment?: string) {
      const r = await svc.get(id);
      if (!r) throw new Error("Record not found");
      const def = getEntity(entity);
      if (!def) throw new Error("Unknown entity");
      const amount = recordTotal(r);
      const docType = def.documentType ?? def.label;
      const matched = rulesFor(docType, amount);
      const autoFloor = Math.max(0, ...matched.map((x) => x.autoApproveBelow));
      const discountHold = entity === "quotations" && r.lines.reduce((m, l) => Math.max(m, l.discountPct ?? 0), 0) > 10;
      if (matched.length && autoFloor > 0 && amount < autoFloor && !discountHold) {
        return svc.transition(id, approveTarget(def), `Auto-approved (below NPR ${autoFloor.toLocaleString()})`);
      }
      const submitComment = discountHold
        ? `Submitted — line discount exceeds 10% threshold`
        : comment ?? "Submitted for approval";
      const updated = await svc.transition(id, submitTarget(def), submitComment);
      const a = actor();
      const minLevel = matched.length ? Math.min(...matched.map((x) => x.level)) : 1;
      const atLevel = matched.filter((x) => x.level === minLevel);
      const mode = atLevel[0]?.mode ?? "sequential";
      const createFrom: Array<ApprovalRule | undefined> = atLevel.length
        ? mode === "parallel"
          ? atLevel
          : [atLevel[0]]
        : [undefined];
      const maxLevel = matched.length ? Math.max(...matched.map((x) => x.level)) : 1;
      const seed: ApprovalRequest[] = createFrom.map((rule) => ({
        id: rid("APR"),
        entity,
        recordId: r.id,
        recordCode: r.code,
        documentType: docType,
        requester: a.name,
        department: def.department ?? "General",
        amount,
        level: rule?.level ?? 1,
        totalLevels: maxLevel,
        dueDate: dueDateFromHours(rule?.escalationHours ?? 24),
        priority: amount > 500000 ? "high" : "normal",
        status: "pending",
        approverRole: rule?.approverRole ?? "manager",
        mode,
        createdAt: now(),
      }));
      db.set((s) => ({ approvals: [...seed, ...s.approvals] }));
      notify({ type: "approval", priority: "high", title: `${def.label} awaiting approval`, body: `${r.code} submitted by ${a.name} (NPR ${amount.toLocaleString()})`, module: opts.module, link: { entity, id: r.id } });
      return updated;
    },
    async approve(id: string, comment?: string) {
      const r = await svc.get(id);
      if (!r) throw new Error("Record not found");
      const def = getEntity(entity);
      if (!def) throw new Error("Unknown entity");
      const a = actor();
      const pending = db.get().approvals.filter(
        (ap) => (ap.recordId === r.id || ap.recordCode === r.code) && (ap.status === "pending" || ap.status === "delegated"),
      );
      const current = pending[0];
      if (current) {
        db.set((s) => ({
          approvals: s.approvals.map((ap) =>
            ap.id === current.id
              ? { ...ap, status: "approved", decidedAt: now(), decidedBy: a.name, reason: comment }
              : ap,
          ),
        }));
        const remainingSame = db.get().approvals.filter(
          (ap) => (ap.recordId === r.id || ap.recordCode === r.code) && ap.level === current.level && ap.status === "pending",
        );
        if (current.mode === "parallel" && remainingSame.length) {
          logAudit({ action: "approve", module: opts.module, entity, recordId: r.id, recordCode: r.code, reason: comment ?? `Level ${current.level} partial` });
          notify({ type: "approval", priority: "normal", title: `${r.code} level ${current.level} signed`, body: comment ?? "Waiting for remaining parallel approvers.", module: opts.module, link: { entity, id: r.id } });
          return r;
        }
        const matched = rulesFor(current.documentType, current.amount);
        const nextRules = matched.filter((x) => x.level === current.level + 1);
        if (nextRules.length) {
          const nextMode = nextRules[0].mode;
          const createFrom = nextMode === "parallel" ? nextRules : [nextRules[0]];
          const next: ApprovalRequest[] = createFrom.map((rule) => ({
            id: rid("APR"),
            entity,
            recordId: r.id,
            recordCode: r.code,
            documentType: current.documentType,
            requester: current.requester,
            department: current.department,
            amount: current.amount,
            level: rule.level,
            totalLevels: current.totalLevels,
            dueDate: dueDateFromHours(rule.escalationHours),
            priority: current.priority,
            status: "pending",
            approverRole: rule.approverRole,
            mode: nextMode,
            createdAt: now(),
          }));
          db.set((s) => ({ approvals: [...next, ...s.approvals] }));
          logAudit({ action: "approve", module: opts.module, entity, recordId: r.id, recordCode: r.code, reason: comment ?? `Advanced to level ${current.level + 1}` });
          notify({ type: "approval", priority: "high", title: `${r.code} needs level ${current.level + 1}`, body: `Forwarded to ${createFrom.map((x) => x.approverRole).join(", ")}.`, module: opts.module, link: { entity, id: r.id } });
          return r;
        }
      }
      const updated = await svc.transition(id, approveTarget(def), comment ?? "Approved");
      notify({ type: "approval", priority: "normal", title: `${updated.code} approved`, body: comment ?? "Document approved.", module: opts.module, link: { entity, id: updated.id } });
      return updated;
    },
    async reject(id: string, reason: string) {
      if (!reason?.trim()) throw new Error("Rejection reason is required");
      const updated = await svc.transition(id, "rejected", reason);
      const a = actor();
      db.set((s) => ({
        approvals: s.approvals.map((ap) =>
          (ap.recordId === updated.id || ap.recordCode === updated.code) && (ap.status === "pending" || ap.status === "delegated")
            ? { ...ap, status: "rejected", decidedAt: now(), decidedBy: a.name, reason }
            : ap,
        ),
      }));
      notify({ type: "rejection", priority: "high", title: `${updated.code} rejected`, body: reason, module: opts.module, link: { entity, id: updated.id } });
      return updated;
    },
    async returnToSender(id: string, reason: string) {
      if (!reason?.trim()) throw new Error("Return reason is required");
      const def = getEntity(entity);
      if (!def) throw new Error("Unknown entity");
      const updated = await svc.transition(id, returnTarget(def), reason);
      const a = actor();
      db.set((s) => ({
        approvals: s.approvals.map((ap) =>
          (ap.recordId === updated.id || ap.recordCode === updated.code) && (ap.status === "pending" || ap.status === "delegated")
            ? { ...ap, status: "returned", decidedAt: now(), decidedBy: a.name, reason }
            : ap,
        ),
      }));
      notify({ type: "approval", priority: "high", title: `${updated.code} returned`, body: reason, module: opts.module, link: { entity, id: updated.id } });
      return updated;
    },
    async delegate(id: string, toName: string, reason?: string) {
      if (!toName.trim()) throw new Error("Delegate is required");
      const r = await svc.get(id);
      if (!r) throw new Error("Record not found");
      const a = actor();
      db.set((s) => ({
        approvals: s.approvals.map((ap) =>
          (ap.recordId === r.id || ap.recordCode === r.code) && (ap.status === "pending" || ap.status === "delegated")
            ? { ...ap, status: "pending", delegatedTo: toName, reason }
            : ap,
        ),
      }));
      logAudit({ action: "delegate", module: opts.module, entity, recordId: r.id, recordCode: r.code, reason: reason ?? `Delegated to ${toName}` });
      notify({ type: "approval", priority: "high", title: `${r.code} delegated to ${toName}`, body: reason ?? `${a.name} asked ${toName} to decide.`, module: opts.module, link: { entity, id: r.id } });
      return r;
    },
    async cancel(id: string, reason: string) {
      if (!reason?.trim()) throw new Error("Cancellation reason is required");
      const updated = await svc.transition(id, "cancelled", reason);
      notify({
        type: "system",
        priority: "normal",
        title: `${updated.code} cancelled`,
        body: reason,
        module: opts.module,
        link: { entity, id: updated.id },
      });
      return updated;
    },
    async post(id: string, comment?: string) {
      return svc.transition(id, "posted", comment ?? "Posted to ledger");
    },
    async reverse(id: string, reason: string) {
      if (!reason?.trim()) throw new Error("Reversal reason is required");
      return svc.transition(id, "reversed", reason);
    },
    async link(id: string, target: { entity: string; id: string; label?: string }) {
      const r = await svc.get(id);
      if (!r) return;
      if (r.links.some((l) => l.id === target.id)) return;
      await svc.update(r.id, { links: [...r.links, target] });
    },
  };
  return svc;
}

export type EntityService = ReturnType<typeof createEntityService>;

/* ---------------- React hooks ---------------- */

export function useRecords(entity: string): ErpRecord[] {
  const mock = useDb((s) => s.records[entity] ?? EMPTY_RECORDS);
  const live = useAuthStore((s) => s.source === "api");
  const { data } = useQuery({
    queryKey: ["records", entity],
    queryFn: () => listRecords(entity),
    enabled: live && Boolean(RECORD_PATHS[entity]),
    staleTime: 15_000,
    retry: 1,
  });
  return live && data ? data : mock;
}
export function useRecord(entity: string, code: string): ErpRecord | undefined {
  const rows = useRecords(entity);
  return rows.find((r) => r.code === code || r.id === code);
}
export function useAudit(): AuditEvent[] {
  const mock = useDb((s) => s.audit);
  const live = useAuthStore((s) => s.source === "api");
  const { data } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => fetchAuditLogs(),
    enabled: live,
    staleTime: 10_000,
    retry: 1,
  });
  return live && data ? data : mock;
}

export function useInvalidateRecords() {
  return useQueryClient();
}
export function useNotifications(): NotificationItem[] {
  return useDb((s) => s.notifications);
}
export function useApprovals() {
  return useDb((s) => s.approvals);
}
export function useApprovalRules() {
  return useDb((s) => s.approvalRules);
}
export function saveApprovalRule(rule: ApprovalRule) {
  db.set((s) => ({
    approvalRules: s.approvalRules.some((r) => r.id === rule.id)
      ? s.approvalRules.map((r) => (r.id === rule.id ? rule : r))
      : [...s.approvalRules, rule],
  }));
  logAudit({ action: "edit", module: "settings", entity: "approval_rules", recordCode: rule.id, after: rule });
}
export function removeApprovalRule(id: string) {
  const before = db.get().approvalRules.find((r) => r.id === id);
  db.set((s) => ({ approvalRules: s.approvalRules.filter((r) => r.id !== id) }));
  logAudit({ action: "delete", module: "settings", entity: "approval_rules", recordCode: id, before });
}
const viewedIds = new Set<string>();
export function logView(module: string, entity: string, recordId: string, recordCode: string) {
  const key = `${recordId}:${typeof window === "undefined" ? "ssr" : "client"}`;
  if (viewedIds.has(key)) return;
  viewedIds.add(key);
  logAudit({ action: "view", module, entity, recordId, recordCode });
}
export function markNotificationRead(id: string, read = true) {
  db.set((s) => ({
    notifications: s.notifications.map((n) => (n.id === id ? { ...n, read } : n)),
  }));
}
export function markAllNotificationsRead() {
  db.set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
}

export function makeLines(count = 1): LineItem[] {
  return Array.from({ length: count }, () => ({
    id: rid("ln"), item: "", description: "", uom: "PCS", qty: 1, rate: 0, discountPct: 0, taxPct: 13,
  }));
}
export const newLineId = () => rid("ln");
