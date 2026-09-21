import type { EntityDef } from "@/features/registry/entities";
import type { DocStatus, ErpRecord } from "@/types/erp";

export type WorkflowAction = "edit" | "submit" | "approve" | "reject" | "return" | "cancel" | "post" | "reverse";

const LOCKED: DocStatus[] = ["posted", "reversed", "cancelled", "completed", "closed"];

/** Allowed next statuses from each state. Intersection with the entity's statuses is applied at check time. */
const GRAPH: Record<DocStatus, DocStatus[]> = {
  draft: ["submitted", "pending_approval", "cancelled", "active", "open", "in_progress", "released", "approved", "hold"],
  submitted: ["pending_approval", "approved", "rejected", "returned", "cancelled", "in_progress"],
  pending_approval: ["approved", "rejected", "returned", "cancelled", "posted"],
  approved: ["posted", "released", "in_progress", "completed", "cancelled", "active"],
  rejected: ["draft", "pending_approval", "cancelled"],
  returned: ["draft", "submitted", "pending_approval", "cancelled"],
  released: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "hold", "cancelled", "closed"],
  completed: ["closed", "cancelled"],
  posted: ["reversed"],
  reversed: [],
  cancelled: [],
  active: ["inactive"],
  inactive: ["active"],
  hold: ["released", "approved", "in_progress", "cancelled", "completed"],
  open: ["in_progress", "completed", "closed", "cancelled"],
  closed: [],
};

export function isLocked(status: DocStatus): boolean {
  return LOCKED.includes(status);
}

export function allowedNext(from: DocStatus, def: EntityDef): DocStatus[] {
  return (GRAPH[from] ?? []).filter((s) => def.statuses.includes(s));
}

export function canTransition(from: DocStatus, to: DocStatus, def: EntityDef): boolean {
  if (from === to) return true;
  return allowedNext(from, def).includes(to);
}

export function assertTransition(from: DocStatus, to: DocStatus, def: EntityDef): void {
  if (canTransition(from, to, def)) return;
  const next = allowedNext(from, def);
  const allowed = next.length ? next.join(", ") : "none";
  throw new Error(`Illegal transition: cannot move ${def.singular} from ${from} to ${to}. Allowed: ${allowed}.`);
}

export function approveTarget(def: EntityDef): DocStatus {
  if (def.statuses.includes("approved")) return "approved";
  if (def.statuses.includes("posted")) return "posted";
  return "approved";
}

export function submitTarget(def: EntityDef): DocStatus {
  if (def.statuses.includes("pending_approval")) return "pending_approval";
  if (def.statuses.includes("submitted")) return "submitted";
  throw new Error(`${def.singular} does not have a submit step.`);
}

export function returnTarget(def: EntityDef): DocStatus {
  if (def.statuses.includes("returned")) return "returned";
  if (def.statuses.includes("draft")) return "draft";
  throw new Error(`${def.singular} cannot be returned.`);
}

export function workflowActions(record: ErpRecord, def: EntityDef): WorkflowAction[] {
  const s = record.status;
  const set = new Set(def.statuses);
  const actions: WorkflowAction[] = [];

  if (!isLocked(s)) actions.push("edit");

  if (["draft", "rejected", "returned"].includes(s)) {
    if (set.has("pending_approval") || set.has("submitted") || def.workflow?.includes("pending_approval")) {
      actions.push("submit");
    }
    if (set.has("posted") && !set.has("pending_approval") && canTransition(s, "posted", def)) {
      actions.push("post");
    }
  }

  if (s === "pending_approval" || s === "submitted") {
    actions.push("approve", "reject");
    if (set.has("returned") || set.has("draft")) actions.push("return");
  }

  if (s === "approved" && set.has("posted")) actions.push("post");

  if (s === "posted" && set.has("reversed")) actions.push("reverse");

  if (set.has("cancelled") && !["cancelled", "reversed", "posted", "completed", "closed"].includes(s)) {
    actions.push("cancel");
  }

  return actions;
}
