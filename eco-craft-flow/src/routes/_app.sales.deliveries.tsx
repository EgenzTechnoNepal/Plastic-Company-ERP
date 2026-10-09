import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, PackageMinus, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/sales/deliveries")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  return (
    <EntityListPage
      entity="deliveries"
      kpis={(rows) => [
        { label: "Challans", value: rows.length, icon: Truck },
        { label: "Quantity", value: rows.reduce((s, r) => s + r.lines.reduce((n, l) => n + Number(l.qty || 0), 0), 0).toLocaleString("en-IN"), icon: PackageMinus },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: Clock, accent: "secondary" },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
