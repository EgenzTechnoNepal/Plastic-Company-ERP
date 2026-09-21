import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, IndianRupee, Layers } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/production/bom")({
  component: BomPage,
});

function BomPage() {
  return (
    <EntityListPage
      entity="boms"
      kpis={(rows) => [
        { label: "BOMs", value: rows.length, icon: ClipboardList },
        { label: "Approved", value: rows.filter((r) => r.status === "approved").length, icon: CheckCircle2, accent: "accent" },
        { label: "Components", value: rows.reduce((s, r) => s + r.lines.length, 0), icon: Layers, accent: "secondary" },
        { label: "Avg Unit Cost", value: rows.length ? npr(sumField(rows, "unitCost") / rows.length) : "—", icon: IndianRupee, accent: "muted" },
      ]}
    />
  );
}
