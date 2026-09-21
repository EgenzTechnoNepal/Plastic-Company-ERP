import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/returns")({
  component: PurchaseReturnsPage,
});

function PurchaseReturnsPage() {
  return (
    <EntityListPage
      entity="purchase_returns"
      kpis={(rows) => [
        { label: "Returns", value: rows.length, icon: RotateCcw },
        { label: "Submitted", value: rows.filter((r) => r.status === "submitted").length, icon: ClipboardCheck, accent: "secondary" },
        { label: "Failed QC", value: rows.filter((r) => str(r, "inspection") === "Failed").length, icon: ShieldAlert, accent: "muted" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: Truck, accent: "accent" },
      ]}
    />
  );
}
