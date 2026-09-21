import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Clock, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/purchase/orders")({
  component: PurchaseOrdersPage,
});

function PurchaseOrdersPage() {
  return (
    <EntityListPage
      entity="purchase_orders"
      kpis={(rows) => [
        { label: "Purchase Orders", value: rows.length, icon: ClipboardList },
        { label: "Committed", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Open", value: rows.filter((r) => !["completed", "cancelled"].includes(r.status)).length, icon: Clock, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
