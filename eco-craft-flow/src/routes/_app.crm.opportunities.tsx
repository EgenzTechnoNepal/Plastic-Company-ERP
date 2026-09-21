import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, IndianRupee, Percent, Target } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { num, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/crm/opportunities")({
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  return (
    <EntityListPage
      entity="opportunities"
      kpis={(rows) => [
        { label: "Opportunities", value: rows.length, icon: Briefcase },
        { label: "Pipeline", value: npr(sumField(rows, "value")), icon: IndianRupee },
        { label: "Weighted", value: npr(rows.reduce((s, r) => s + num(r, "value") * (num(r, "probability") / 100), 0)), icon: Percent, accent: "secondary" },
        { label: "Open", value: rows.filter((r) => r.status === "open" || r.status === "in_progress").length, icon: Target, accent: "accent" },
      ]}
    />
  );
}
