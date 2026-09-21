import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, Factory, XCircle } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/in-process")({
  component: InProcessPage,
});

function InProcessPage() {
  return (
    <EntityListPage
      entity="qc_inspections"
      exportName="in-process-qc"
      filter={(r) => str(r, "stage") === "In-Process"}
      extraFilters={[
        {
          key: "result",
          placeholder: "All results",
          options: ["Pass", "Fail"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "result") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Inspections", value: rows.length, icon: Factory },
        { label: "Passed", value: rows.filter((r) => str(r, "result") === "Pass").length, icon: CheckCircle2, accent: "accent" },
        { label: "Failed", value: rows.filter((r) => str(r, "result") === "Fail").length, icon: XCircle, accent: "muted" },
        { label: "On Hold", value: rows.filter((r) => r.status === "hold").length, icon: Clock, accent: "secondary" },
      ]}
    />
  );
}
