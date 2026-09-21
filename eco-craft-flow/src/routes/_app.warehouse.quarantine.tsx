import { createFileRoute } from "@tanstack/react-router";
import { Lock, MapPin, Package, Unlock } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/warehouse/quarantine")({
  component: WarehouseQuarantinePage,
});

function WarehouseQuarantinePage() {
  return (
    <EntityListPage
      entity="quarantine"
      extraFilters={[
        {
          key: "warehouse",
          placeholder: "All warehouses",
          options: ["WH-QR", "WH-FG", "WH-RM"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "warehouse") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Holds", value: rows.length, icon: Lock },
        { label: "Qty held", value: nf.format(sumField(rows, "qty")), icon: Package },
        { label: "On hold", value: rows.filter((r) => r.status === "hold").length, icon: MapPin, accent: "muted" },
        { label: "Released", value: rows.filter((r) => r.status === "released").length, icon: Unlock, accent: "accent" },
      ]}
    />
  );
}
