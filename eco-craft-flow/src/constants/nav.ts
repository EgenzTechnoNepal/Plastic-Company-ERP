import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Truck,
  Boxes,
  Warehouse,
  Factory,
  ShieldCheck,
  UserCog,
  Wallet,
  BarChart3,
  Bell,
  Settings,
  History,
  ClipboardCheck,
  FileSpreadsheet,
  Sparkles,
  Plug,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./roles";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: readonly Role[];
  group: "operations" | "commerce" | "people" | "system" | "integrations";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "operations" },
  { label: "CRM", to: "/crm", icon: Users, group: "commerce", roles: ["manager", "sales"] },
  { label: "Sales", to: "/sales", icon: ShoppingCart, group: "commerce", roles: ["manager", "sales"] },
  { label: "Purchase", to: "/purchase", icon: Truck, group: "commerce", roles: ["manager", "purchase"] },
  { label: "Inventory", to: "/inventory", icon: Boxes, group: "operations", roles: ["manager", "warehouse", "production"] },
  { label: "Warehouse", to: "/warehouse", icon: Warehouse, group: "operations", roles: ["manager", "warehouse"] },
  { label: "Production", to: "/production", icon: Factory, group: "operations", roles: ["manager", "production"] },
  { label: "Quality Control", to: "/quality-control", icon: ShieldCheck, group: "operations", roles: ["manager", "quality_control", "production"] },
  { label: "HR", to: "/hr", icon: UserCog, group: "people", roles: ["manager", "hr"] },
  { label: "Accounting", to: "/accounting", icon: Wallet, group: "commerce", roles: ["manager"] },
  { label: "IRD / CBMS", to: "/ird", icon: FileSpreadsheet, group: "integrations", roles: ["manager"] },
  { label: "Integrations", to: "/integrations", icon: Plug, group: "integrations", roles: ["manager"] },
  { label: "AI workspace", to: "/ai", icon: Sparkles, group: "system", roles: ["manager"] },
  { label: "Reports", to: "/reports", icon: BarChart3, group: "system", roles: ["manager", "sales", "purchase", "warehouse", "production", "hr", "quality_control"] },
  { label: "Notifications", to: "/notifications", icon: Bell, group: "system" },
  { label: "Approvals", to: "/approvals", icon: ClipboardCheck, group: "system", roles: ["manager"] },
  { label: "Audit Logs", to: "/audit-logs", icon: History, group: "system", roles: ["manager"] },
  { label: "Settings", to: "/settings", icon: Settings, group: "system", roles: ["manager"] },
];

export const NAV_GROUPS: Array<{ id: NavItem["group"]; label: string }> = [
  { id: "operations", label: "Operations" },
  { id: "commerce", label: "Commerce" },
  { id: "people", label: "People" },
  { id: "integrations", label: "Integrations" },
  { id: "system", label: "System" },
];