import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardCheck, Clock, UserCog } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/capa")({
  component: CapaPage,
});

function CapaPage() {
  return (
    <EntityListPage
      entity="capas"
      extraFilters={[
        {
          key: "stage",
          placeholder: "All stages",
          options: ["Containment", "Root Cause", "Corrective Action", "Preventive Action", "Effectiveness", "Closure"].map(
            (v) => ({ value: v, label: v }),
          ),
          match: (row, value) => str(row, "stage") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "CAPAs", value: rows.length, icon: ClipboardCheck },
        { label: "In Progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Closed", value: rows.filter((r) => r.status === "closed" || r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "Owners", value: new Set(rows.map((r) => str(r, "owner"))).size, icon: UserCog, accent: "muted" },
      ]}
    />
  );
}
