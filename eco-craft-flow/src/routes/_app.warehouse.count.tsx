import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, IndianRupee, ScanLine } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/warehouse/count")({
  component: CountPage,
});

function CountPage() {
  return (
    <EntityListPage
      entity="stock_counts"
      kpis={(rows) => [
        { label: "Counts", value: rows.length, icon: ScanLine },
        { label: "Items Counted", value: sumField(rows, "itemsCounted").toLocaleString("en-IN"), icon: ClipboardList },
        { label: "Variances", value: sumField(rows, "variances"), icon: AlertTriangle, accent: "muted" },
        { label: "Variance Value", value: npr(sumField(rows, "varianceValue")), icon: IndianRupee, accent: "secondary" },
      ]}
    />
  );
}
