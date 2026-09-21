import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, CheckCircle2, Clock, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/warehouse/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  return (
    <EntityListPage
      entity="stock_transfers"
      extraFilters={[
        {
          key: "stage",
          placeholder: "All stages",
          options: ["Requested", "Dispatched", "In Transit", "Received"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "stage") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Transfers", value: rows.length, icon: ArrowLeftRight },
        { label: "In transit", value: rows.filter((r) => str(r, "stage") === "In Transit").length, icon: Truck, accent: "secondary" },
        { label: "Received", value: rows.filter((r) => str(r, "stage") === "Received" || r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "Open", value: rows.filter((r) => r.status !== "completed" && r.status !== "cancelled").length, icon: Clock, accent: "muted" },
      ]}
    />
  );
}
