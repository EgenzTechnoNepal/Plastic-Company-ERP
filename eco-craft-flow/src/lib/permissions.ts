import type { ReactNode } from "react";
import type { Role } from "@/constants/roles";
import { ROLES } from "@/constants/roles";
import { useAuthStore } from "@/store/auth";
import { db, useDb } from "@/services/mock/db";
import { ENTITY_PATHS } from "@/features/registry/paths";
import type { FieldAccess } from "@/types/erp";

export type PermAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "submit"
  | "approve"
  | "export"
  | "print"
  | "cancel"
  | "post"
  | "reverse";

export const PERM_ACTIONS: PermAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "submit",
  "approve",
  "export",
  "print",
  "cancel",
  "post",
  "reverse",
];

const WRITE: PermAction[] = ["view", "create", "edit", "submit", "cancel", "export", "print"];
const VIEW_ONLY: PermAction[] = ["view", "export", "print"];

const MODULE_ROLES: Record<string, Role[]> = {
  crm: ["sales"],
  sales: ["sales"],
  purchase: ["purchase"],
  inventory: ["warehouse", "production"],
  warehouse: ["warehouse"],
  production: ["production"],
  "quality-control": ["quality_control", "production"],
  hr: ["hr"],
  accounting: [],
  reports: ["sales", "purchase", "warehouse", "production", "hr", "quality_control"],
  system: ["manager"],
  integrations: ["manager"],
  approvals: ["manager"],
};

export interface PermScreen {
  module: string;
  screen: string;
  label: string;
}

export const PERM_SCREENS: PermScreen[] = [
  ...ENTITY_PATHS.filter((p) => !["alerts", "receiving", "in-process", "finished"].includes(p.slug)).map((p) => ({
    module: p.module,
    screen: p.slug,
    label: p.slug.replace(/-/g, " "),
  })),
  { module: "system", screen: "dashboard", label: "Dashboard" },
  { module: "system", screen: "notifications", label: "Notifications" },
  { module: "system", screen: "audit-logs", label: "Audit logs" },
  { module: "system", screen: "settings", label: "Settings" },
  { module: "approvals", screen: "inbox", label: "Approval inbox" },
  { module: "approvals", screen: "matrix", label: "Approval matrix" },
];

export function permKey(role: Role, module: string, screen: string, action: PermAction): string {
  return `${role}::${module}::${screen}::${action}`;
}

export function fieldKey(role: Role, entity: string, field: string): string {
  return `${role}::${entity}::${field}`;
}

export function hasRole(userRole: Role | undefined, allowed?: readonly Role[], extraRoles?: readonly Role[]): boolean {
  if (!userRole && !extraRoles?.length) return false;
  if (!allowed || allowed.length === 0) return true;
  const roles = new Set<Role>([...(extraRoles ?? []), ...(userRole ? [userRole] : [])]);
  if (roles.has("administrator")) return true;
  return allowed.some((r) => roles.has(r));
}

export function defaultCan(role: Role | undefined, action: PermAction, module?: string): boolean {
  if (!role) return false;
  if (role === "administrator" || role === "manager") return true;
  if (role === "viewer") return VIEW_ONLY.includes(action);

  if (module) {
    const allowed = MODULE_ROLES[module];
    if (allowed && allowed.length > 0 && !allowed.includes(role)) return false;
    if (allowed && allowed.length === 0) return VIEW_ONLY.includes(action);
  }

  if (action === "approve" || action === "post" || action === "reverse" || action === "delete") {
    return false;
  }
  return WRITE.includes(action);
}

export function can(role: Role | undefined, action: PermAction, module?: string, screen?: string): boolean {
  if (!role) return false;
  if (role === "administrator") return true;

  const overrides = db.get().permissionOverrides ?? {};
  if (module && screen) {
    const exact = overrides[permKey(role, module, screen, action)];
    if (typeof exact === "boolean") return exact;
  }
  if (module) {
    const star = overrides[permKey(role, module, "*", action)];
    if (typeof star === "boolean") return star;
  }
  return defaultCan(role, action, module);
}

const SALARY_FIELDS = ["basicSalary", "ssf", "basic", "allowances", "overtime", "cit", "tax", "net", "gross"];
const PAYROLL_ENTITIES = new Set(["employees", "payslips", "payroll_runs"]);
const COST_FIELDS = ["rate", "valuation"];
const CREDIT_FIELDS = ["creditLimit", "outstanding"];

export function defaultFieldAccess(role: Role | undefined, entity: string, field: string): FieldAccess {
  if (!role) return "hidden";
  if (role === "administrator" || role === "manager") return "edit";

  if (PAYROLL_ENTITIES.has(entity) && SALARY_FIELDS.includes(field)) {
    return role === "hr" ? "edit" : "hidden";
  }
  if (entity === "products" && COST_FIELDS.includes(field)) {
    if (role === "sales" || role === "viewer") return "hidden";
    return defaultCan(role, "edit", "inventory") ? "edit" : "readonly";
  }
  if (entity === "customers" && CREDIT_FIELDS.includes(field)) {
    if (role === "sales") return "readonly";
    return defaultCan(role, "edit", "crm") ? "edit" : "readonly";
  }
  if (entity === "dealers" && field === "commissionPct" && role === "sales") return "readonly";

  if (role === "viewer") return "readonly";
  const module = ENTITY_PATHS.find((p) => p.entity === entity)?.module;
  if (defaultCan(role, "edit", module)) return "edit";
  if (defaultCan(role, "view", module)) return "readonly";
  return "hidden";
}

export function fieldAccess(role: Role | undefined, entity: string, field: string): FieldAccess {
  if (!role) return "hidden";
  if (role === "administrator") return "edit";
  const overrides = db.get().fieldOverrides ?? {};
  const hit = overrides[fieldKey(role, entity, field)];
  if (hit === "hidden" || hit === "readonly" || hit === "edit") return hit;
  return defaultFieldAccess(role, entity, field);
}

export function setPermission(role: Role, module: string, screen: string, action: PermAction, allowed: boolean) {
  const key = permKey(role, module, screen, action);
  db.set((s) => ({ permissionOverrides: { ...s.permissionOverrides, [key]: allowed } }));
}

export function setFieldPermission(role: Role, entity: string, field: string, access: FieldAccess) {
  const key = fieldKey(role, entity, field);
  db.set((s) => ({ fieldOverrides: { ...s.fieldOverrides, [key]: access } }));
}

export function resetRolePermissions(role: Role) {
  const prefix = `${role}::`;
  db.set((s) => {
    const permissionOverrides = Object.fromEntries(
      Object.entries(s.permissionOverrides ?? {}).filter(([k]) => !k.startsWith(prefix)),
    );
    const fieldOverrides = Object.fromEntries(
      Object.entries(s.fieldOverrides ?? {}).filter(([k]) => !k.startsWith(prefix)),
    );
    return { permissionOverrides, fieldOverrides };
  });
}

export function usePermission(allowed?: readonly Role[]) {
  const role = useAuthStore((s) => s.user?.role);
  const roles = useAuthStore((s) => s.user?.roles);
  return hasRole(role, allowed, roles);
}

export function useCan(action: PermAction, module?: string, screen?: string) {
  const role = useAuthStore((s) => s.user?.role);
  useDb((s) => s.permissionOverrides);
  return can(role, action, module, screen);
}

export function useFieldAccess(entity: string, field: string): FieldAccess {
  const role = useAuthStore((s) => s.user?.role);
  useDb((s) => s.fieldOverrides);
  return fieldAccess(role, entity, field);
}

export function PermissionGuard({
  action,
  module,
  screen,
  entity,
  field,
  children,
  fallback = null,
}: {
  action: PermAction;
  module?: string;
  screen?: string;
  entity?: string;
  field?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const role = useAuthStore((s) => s.user?.role);
  useDb((s) => s.permissionOverrides);
  useDb((s) => s.fieldOverrides);
  if (entity && field) {
    const access = fieldAccess(role, entity, field);
    if (access === "hidden") return fallback;
    if (action === "edit" && access !== "edit") return fallback;
  }
  return can(role, action, module, screen) ? children : fallback;
}

/** Roles the matrix editor can switch between (admin is always-on). */
export const MATRIX_ROLES: Role[] = ROLES.filter((r) => r !== "administrator");
