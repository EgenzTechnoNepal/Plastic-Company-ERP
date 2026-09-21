import { createFileRoute } from "@tanstack/react-router";
import { Calculator, CheckCircle2, ClipboardList, PackageSearch } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { MrpPanel } from "@/features/production/MrpPanel";
import { mrpRowsOf } from "@/features/production/cycle";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/production/mrp")({
  component: MrpPage,
});

function MrpPage() {
  const runs = useRecords("mrp_runs");
  const latest = runs[0];
  const suggestions = runs.flatMap((r) => mrpRowsOf(r));
  const pending = suggestions.filter((r) => r.net > 0 && !r.converted).length;

  return (
    <div className="space-y-6">
      <EntityListPage
        entity="mrp_runs"
        kpis={(rows) => [
          { label: "MRP runs", value: rows.length, icon: Calculator },
          { label: "Suggestions", value: suggestions.length, icon: ClipboardList, accent: "secondary" },
          { label: "Awaiting convert", value: pending, icon: PackageSearch, accent: "muted" },
          { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        ]}
      />
      {latest && <MrpPanel run={latest} />}
    </div>
  );
}
