import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, PackageCheck, ShieldAlert, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/receipts")({
  component: ReceiptsPage,
});

function ReceiptsPage() {
  return (
    <EntityListPage
      entity="grns"
      extraFilters={[
        {
          key: "inspection",
          placeholder: "All inspections",
          options: ["Pending", "Passed", "Failed"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "inspection") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "GRNs", value: rows.length, icon: PackageCheck },
        { label: "Accepted Qty", value: sumField(rows, "acceptedQty").toLocaleString("en-IN"), icon: Truck },
        { label: "Rejected Qty", value: sumField(rows, "rejectedQty").toLocaleString("en-IN"), icon: ShieldAlert, accent: "muted" },
        { label: "Passed QC", value: rows.filter((r) => str(r, "inspection") === "Passed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
