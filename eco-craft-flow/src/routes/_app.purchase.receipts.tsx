import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, PackageCheck, ShieldAlert, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/receipts")({
  component: ReceiptsPage,
});

function ReceiptsPage() {
  return (
    <EntityListPage
      entity="grns"
      kpis={(rows) => [
        { label: "GRNs", value: rows.length, icon: PackageCheck },
        { label: "Accepted Qty", value: sumField(rows, "acceptedQty").toLocaleString("en-IN"), icon: Truck },
        { label: "Rejected Qty", value: sumField(rows, "rejectedQty").toLocaleString("en-IN"), icon: ShieldAlert, accent: "muted" },
        { label: "Posted", value: rows.filter((r) => String(r.fields.serverStatus ?? r.status) === "POSTED").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
