import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Cog, Pause, Play } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/production/operations")({
  component: OperationsPage,
});

function OperationsPage() {
  return (
    <EntityListPage
      entity="operations"
      extraFilters={[
        {
          key: "workCentre",
          placeholder: "All centres",
          options: ["Extrusion", "Printing", "Sealing", "Packing"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "workCentre") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Operations", value: rows.length, icon: Cog },
        { label: "Running", value: rows.filter((r) => r.status === "in_progress").length, icon: Play, accent: "secondary" },
        { label: "Paused", value: rows.filter((r) => r.status === "hold").length, icon: Pause, accent: "muted" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
