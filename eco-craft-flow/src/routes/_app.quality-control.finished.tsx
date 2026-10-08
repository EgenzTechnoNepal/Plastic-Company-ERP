import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, PackageCheck, XCircle } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/quality-control/finished")({
  component: FinishedPage,
});

function FinishedPage() {
  return (
    <EntityListPage
      entity="qc_inspections"
      exportName="finished-qc"
      kpis={(rows) => [
        { label: "Inspections", value: rows.length, icon: PackageCheck },
        { label: "QC hold", value: rows.filter((r) => String(r.fields.lotStatus) === "QC_HOLD").length, icon: Clock, accent: "secondary" },
        { label: "Passed", value: rows.filter((r) => String(r.fields.serverStatus ?? r.status) === "PASSED").length, icon: CheckCircle2, accent: "accent" },
        { label: "Failed", value: rows.filter((r) => String(r.fields.serverStatus ?? r.status) === "FAILED").length, icon: XCircle, accent: "muted" },
      ]}
    />
  );
}
