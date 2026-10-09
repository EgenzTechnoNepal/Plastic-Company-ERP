import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, PackageMinus, PackagePlus, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { num, str } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/movements")({
  component: MovementsPage,
});

function MovementsPage() {
  return (
    <EntityListPage
      entity="stock_movements"
      kpis={(rows) => [
        { label: "Movements", value: rows.length, icon: ArrowLeftRight },
        { label: "Inbound", value: rows.filter((r) => num(r, "quantityIn") > 0).length, icon: PackagePlus, accent: "accent" },
        { label: "Outbound", value: rows.filter((r) => num(r, "quantityOut") > 0).length, icon: PackageMinus, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.map((r) => str(r, "warehouse"))).size, icon: Warehouse, accent: "muted" },
      ]}
    />
  );
}
