import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Factory, PackageMinus, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/production/issues")({
  component: IssuesPage,
});

function IssuesPage() {
  return (
    <EntityListPage
      entity="material_issues"
      extraFilters={[
        {
          key: "mode",
          placeholder: "All modes",
          options: ["Manual", "Backflush"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "mode") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Issues", value: rows.length, icon: PackageMinus },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "Work Orders", value: new Set(rows.map((r) => str(r, "workOrder"))).size, icon: Factory, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.map((r) => str(r, "warehouse"))).size, icon: Warehouse, accent: "muted" },
      ]}
    />
  );
}
