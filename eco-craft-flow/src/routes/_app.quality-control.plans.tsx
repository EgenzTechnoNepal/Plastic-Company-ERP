import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, FlaskConical, Layers } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/plans")({
  component: QualityPlansPage,
});

function QualityPlansPage() {
  return (
    <EntityListPage
      entity="quality_plans"
      extraFilters={[
        {
          key: "stage",
          placeholder: "All stages",
          options: ["Incoming", "In-Process", "Final"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "stage") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Plans", value: rows.length, icon: ClipboardList },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: CheckCircle2, accent: "accent" },
        { label: "Products", value: new Set(rows.map((r) => str(r, "product"))).size, icon: Layers, accent: "secondary" },
        { label: "Final specs", value: rows.filter((r) => str(r, "stage") === "Final").length, icon: FlaskConical, accent: "muted" },
      ]}
    />
  );
}
