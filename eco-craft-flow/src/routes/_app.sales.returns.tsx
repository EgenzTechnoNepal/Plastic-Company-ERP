import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/sales/returns")({
  component: SalesReturnsPage,
});

function SalesReturnsPage() {
  return (
    <EntityListPage
      entity="sales_returns"
      kpis={(rows) => [
        { label: "Returns", value: rows.length, icon: RotateCcw },
        { label: "Submitted", value: rows.filter((r) => r.status === "submitted").length, icon: ClipboardCheck, accent: "secondary" },
        { label: "Quarantine", value: rows.filter((r) => str(r, "disposition") === "Quarantine").length, icon: ShieldAlert, accent: "muted" },
        { label: "Restock", value: rows.filter((r) => str(r, "disposition") === "Restock").length, icon: Truck, accent: "accent" },
      ]}
    />
  );
}
