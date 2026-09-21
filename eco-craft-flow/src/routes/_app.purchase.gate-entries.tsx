import { createFileRoute } from "@tanstack/react-router";
import { Clock, Shield, Truck, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/purchase/gate-entries")({
  component: GateEntriesPage,
});

function GateEntriesPage() {
  return (
    <EntityListPage
      entity="gate_entries"
      kpis={(rows) => [
        { label: "Gate entries", value: rows.length, icon: Truck },
        { label: "In yard", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: Warehouse, accent: "accent" },
        { label: "Open", value: rows.filter((r) => r.status !== "completed").length, icon: Shield, accent: "muted" },
      ]}
    />
  );
}
