import { db } from "@/services/mock/db";
import type { ApprovalRequest, ApprovalRule } from "@/types/erp";
import type { Role } from "@/constants/roles";

export function rulesFor(documentType: string, amount: number): ApprovalRule[] {
  return db
    .get()
    .approvalRules.filter(
      (r) =>
        r.active &&
        r.documentType === documentType &&
        amount >= r.minAmount &&
        (r.maxAmount === null || amount < r.maxAmount),
    )
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

export function dueDateFromHours(hours: number, from = new Date()): string {
  return new Date(from.getTime() + hours * 3600 * 1000).toISOString().slice(0, 10);
}

export function isEscalated(ap: ApprovalRequest, rules: ApprovalRule[] = db.get().approvalRules): boolean {
  if (ap.status !== "pending") return false;
  const rule = rules.find((r) => r.documentType === ap.documentType && r.level === ap.level && r.active);
  const hours = rule?.escalationHours ?? 24;
  const start = new Date(ap.createdAt).getTime();
  if (Number.isNaN(start)) return false;
  return Date.now() - start > hours * 3600 * 1000;
}

export function canDecide(
  ap: ApprovalRequest,
  user: { name: string; role: Role } | null,
): boolean {
  if (!user) return false;
  if (ap.status !== "pending" && ap.status !== "delegated") return false;
  if (ap.delegatedTo) return ap.delegatedTo === user.name || user.role === "administrator";
  if (user.role === "administrator" || user.role === "manager") return true;
  return ap.approverRole === user.role;
}

export function documentTypesFromRules(rules: ApprovalRule[]): string[] {
  return Array.from(new Set(rules.map((r) => r.documentType))).sort();
}
