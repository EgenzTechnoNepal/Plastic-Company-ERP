export const ROLES = [
  "administrator",
  "manager",
  "sales",
  "purchase",
  "warehouse",
  "production",
  "hr",
  "quality_control",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  manager: "Manager",
  sales: "Sales",
  purchase: "Purchase",
  warehouse: "Warehouse",
  production: "Production",
  hr: "HR",
  quality_control: "Quality Control",
  viewer: "Viewer",
};