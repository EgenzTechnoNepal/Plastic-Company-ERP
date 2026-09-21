import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Wrench } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { instrumentOverdue } from "@/features/quality/cycle";

export const Route = createFileRoute("/_app/quality-control/instruments")({
  component: InstrumentsPage,
});

function InstrumentsPage() {
  return (
    <EntityListPage
      entity="instruments"
      kpis={(rows) => [
        { label: "Instruments", value: rows.length, icon: Wrench },
        { label: "Calibrated", value: rows.filter((r) => !instrumentOverdue(r)).length, icon: CheckCircle2, accent: "accent" },
        { label: "Overdue", value: rows.filter((r) => instrumentOverdue(r)).length, icon: AlertTriangle, accent: "muted" },
        { label: "Due 90 days", value: rows.filter((r) => !instrumentOverdue(r)).length, icon: Clock, accent: "secondary" },
      ]}
    />
  );
}
