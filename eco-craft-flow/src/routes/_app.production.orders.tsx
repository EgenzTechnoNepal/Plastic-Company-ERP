import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Factory, Gauge, Play } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/production/orders")({
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  return (
    <EntityListPage
      entity="work_orders"
      kpis={(rows) => {
        const planned = sumField(rows, "plannedQty");
        const produced = sumField(rows, "producedQty");
        return [
          { label: "Work Orders", value: rows.length, icon: Factory },
          { label: "Planned Qty", value: nf.format(planned), icon: Gauge },
          { label: "Produced", value: nf.format(produced), hint: planned ? `${Math.round((produced / planned) * 100)}% of plan` : undefined, icon: CheckCircle2, accent: "accent" },
          { label: "Released", value: rows.filter((r) => r.status === "released" || r.status === "in_progress").length, icon: Play, accent: "secondary" },
        ];
      }}
    />
  );
}
