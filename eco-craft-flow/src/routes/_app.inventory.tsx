import { createFileRoute } from "@tanstack/react-router";
import {
  Boxes,
  ArrowLeftRight,
  AlertTriangle,
  ClipboardList,
  BookOpen,
  Timer,
  ChartColumn,
} from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/inventory/products", label: "Products", icon: Boxes, formKey: "product", formLabel: "New Product" },
  { to: "/inventory/planning", label: "MOQ / Reorder", icon: ClipboardList },
  { to: "/inventory/movements", label: "Movements", icon: ArrowLeftRight, formKey: "stockMovement", formLabel: "New Movement" },
  { to: "/inventory/ledger", label: "Ledger", icon: BookOpen },
  { to: "/inventory/ageing", label: "Ageing", icon: Timer },
  { to: "/inventory/abc", label: "ABC", icon: ChartColumn },
  { to: "/inventory/adjustments", label: "Adjustments", icon: ClipboardList, formKey: "stockAdjustment", formLabel: "New Adjustment" },
  { to: "/inventory/alerts", label: "Alerts", icon: AlertTriangle },
];

function InventoryLayout() {
  return (
    <ModuleTabsLayout
      title="Inventory"
      description="Product 360 · ledger · ageing / ABC · reorder alerts → PR · FIFO / WA / standard"
      tabs={TABS}
    />
  );
}
