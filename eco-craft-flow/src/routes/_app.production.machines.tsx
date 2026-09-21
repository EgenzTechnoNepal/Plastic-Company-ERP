import { createFileRoute } from "@tanstack/react-router";
import { Cog, Gauge, Wrench } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/production/machines")({
  component: MachinesPage,
});

function MachinesPage() {
  return (
    <EntityListPage
      entity="machines"
      kpis={(rows) => [
        { label: "Machines", value: rows.length, icon: Cog },
        { label: "Work centres", value: new Set(rows.map((r) => str(r, "workCentre"))).size, icon: Wrench, accent: "secondary" },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: Gauge, accent: "accent" },
      ]}
    />
  );
}
