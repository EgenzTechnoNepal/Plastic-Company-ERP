import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, Truck, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/warehouse/dispatch")({
  component: DispatchPage,
});

function DispatchPage() {
  return (
    <EntityListPage
      entity="deliveries"
      exportName="warehouse-dispatch"
      kpis={(rows) => [
        { label: "Challans", value: rows.length, icon: Truck },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "In Progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.flatMap((r) => r.lines.map((l) => l.warehouse).filter(Boolean))).size, icon: Warehouse, accent: "muted" },
      ]}
    />
  );
}
