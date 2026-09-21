import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, RotateCcw, ShieldAlert, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/adjustments")({
  component: AdjustmentsPage,
});

function AdjustmentsPage() {
  return (
    <EntityListPage
      entity="stock_adjustments"
      extraFilters={[
        {
          key: "reason",
          placeholder: "All reasons",
          options: ["Cycle count", "Damage", "Expiry", "Write-off", "Found stock"].map((v) => ({
            value: v,
            label: v,
          })),
          match: (row, value) => str(row, "reason").toLowerCase().includes(value.toLowerCase()),
        },
      ]}
      kpis={(rows) => [
        { label: "Adjustments", value: rows.length, icon: ClipboardList },
        { label: "Pending approval", value: rows.filter((r) => r.status === "pending_approval").length, icon: ShieldAlert, accent: "muted" },
        { label: "Returned", value: rows.filter((r) => r.status === "returned").length, icon: RotateCcw, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.map((r) => str(r, "warehouse"))).size, icon: Warehouse, accent: "accent" },
      ]}
    />
  );
}
