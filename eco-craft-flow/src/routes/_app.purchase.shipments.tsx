import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, PackageCheck, Ship, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/purchase/shipments")({
  component: ShipmentsPage,
});

function ShipmentsPage() {
  return (
    <EntityListPage
      entity="shipments"
      kpis={(rows) => [
        { label: "Shipments", value: rows.length, icon: Ship },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: PackageCheck, accent: "accent" },
        { label: "With PO", value: rows.filter((r) => Boolean(r.fields.purchaseOrder)).length, icon: Truck, accent: "secondary" },
        { label: "ETA tracked", value: rows.filter((r) => Boolean(r.fields.eta)).length, icon: CalendarClock, accent: "muted" },
      ]}
    />
  );
}
