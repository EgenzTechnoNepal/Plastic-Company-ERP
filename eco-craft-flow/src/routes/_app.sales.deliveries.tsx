import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, IndianRupee, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/sales/deliveries")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  return (
    <EntityListPage
      entity="deliveries"
      kpis={(rows) => [
        { label: "Challans", value: rows.length, icon: Truck },
        { label: "Value", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "In progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
