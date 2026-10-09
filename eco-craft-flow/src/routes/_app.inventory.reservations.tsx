import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole, PackageCheck, ShieldOff } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/inventory/reservations")({
  component: ReservationsPage,
});

function ReservationsPage() {
  return (
    <EntityListPage
      entity="stock_reservations"
      kpis={(rows) => [
        { label: "Reservations", value: rows.length, icon: LockKeyhole },
        { label: "Open", value: rows.filter((r) => r.status === "open" || String(r.fields.status) === "OPEN").length, icon: PackageCheck, accent: "accent" },
        { label: "Released", value: rows.filter((r) => r.status === "released").length, icon: ShieldOff, accent: "muted" },
      ]}
    />
  );
}
