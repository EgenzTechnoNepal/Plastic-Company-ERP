import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, CheckCircle2, MapPin, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/warehouse/bin-transfers")({
  component: BinTransfersPage,
});

function BinTransfersPage() {
  return (
    <EntityListPage
      entity="bin_transfers"
      kpis={(rows) => [
        { label: "Bin moves", value: rows.length, icon: ArrowLeftRight },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "Open", value: rows.filter((r) => r.status !== "completed").length, icon: MapPin, accent: "secondary" },
        { label: "Warehouses", value: new Set(rows.map((r) => String(r.fields.warehouse ?? ""))).size, icon: Warehouse, accent: "muted" },
      ]}
    />
  );
}
