import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, CheckCircle2, ClipboardList, TriangleAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/production/plans")({
  component: PlansPage,
});

function PlansPage() {
  return (
    <EntityListPage
      entity="production_plans"
      extraFilters={[
        {
          key: "strategy",
          placeholder: "All strategies",
          options: ["Make to Stock", "Make to Order"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "strategy") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Plans", value: rows.length, icon: ClipboardList },
        { label: "Approved", value: rows.filter((r) => r.status === "approved").length, icon: CheckCircle2, accent: "accent" },
        { label: "Planned qty", value: nf.format(sumField(rows, "totalPlannedQty")), icon: CalendarRange },
        { label: "Draft re-plans", value: rows.filter((r) => r.status === "draft").length, icon: TriangleAlert, accent: "secondary" },
      ]}
    />
  );
}
