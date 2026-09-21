import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, PackageMinus, PackagePlus, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/movements")({
  component: MovementsPage,
});

function MovementsPage() {
  return (
    <EntityListPage
      entity="stock_movements"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Receipt", "Issue", "Transfer In", "Transfer Out", "Adjustment", "Production Receipt", "Dispatch", "Put Away"].map(
            (v) => ({ value: v, label: v }),
          ),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Movements", value: rows.length, icon: ArrowLeftRight },
        { label: "Receipts", value: rows.filter((r) => ["Receipt", "Production Receipt"].includes(str(r, "type"))).length, icon: PackagePlus, accent: "accent" },
        { label: "Issues / Dispatch", value: rows.filter((r) => ["Issue", "Dispatch"].includes(str(r, "type"))).length, icon: PackageMinus, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.map((r) => str(r, "warehouse"))).size, icon: Warehouse, accent: "muted" },
      ]}
    />
  );
}
