import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Clock, PackageCheck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { num } from "@/lib/records";

export const Route = createFileRoute("/_app/sales/orders")({
  component: SalesOrdersPage,
});

function SalesOrdersPage() {
  return (
    <EntityListPage
      entity="sales_orders"
      kpis={(rows) => [
        { label: "Orders", value: rows.length, icon: ClipboardList },
        { label: "Reserved Qty", value: rows.reduce((s, r) => s + num(r, "reservedQuantity"), 0).toLocaleString("en-IN"), icon: PackageCheck },
        { label: "In Progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
