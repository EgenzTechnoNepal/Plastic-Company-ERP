import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Clock, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/sales/orders")({
  component: SalesOrdersPage,
});

function SalesOrdersPage() {
  return (
    <EntityListPage
      entity="sales_orders"
      kpis={(rows) => [
        { label: "Orders", value: rows.length, icon: ClipboardList },
        { label: "Order Value", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "In Progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
