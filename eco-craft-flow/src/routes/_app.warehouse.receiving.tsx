import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, PackageCheck, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/warehouse/receiving")({
  component: ReceivingPage,
});

function ReceivingPage() {
  return (
    <EntityListPage
      entity="grns"
      exportName="warehouse-receiving"
      kpis={(rows) => [
        { label: "Receipts", value: rows.length, icon: PackageCheck },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "In Progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "Open", value: rows.filter((r) => !["completed", "cancelled"].includes(r.status)).length, icon: Truck, accent: "muted" },
      ]}
    />
  );
}
