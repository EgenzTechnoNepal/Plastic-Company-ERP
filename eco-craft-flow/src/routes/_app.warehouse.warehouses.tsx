import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Package, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { num, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/warehouse/warehouses")({
  component: WarehousesPage,
});

function WarehousesPage() {
  const bins = useRecords("bins");

  return (
    <EntityListPage
      entity="warehouses"
      kpis={(rows) => {
        const totalBins = bins.length;
        const linked = rows.reduce(
          (s, w) => s + bins.filter((b) => str(b, "warehouse") === w.code).length,
          0,
        );
        return [
          { label: "Warehouses", value: rows.length, icon: Warehouse },
          { label: "Bins linked", value: linked, icon: MapPin, accent: "secondary" },
          { label: "Total bins", value: totalBins, icon: Package, accent: "muted" },
          {
            label: "Avg zones",
            value: rows.length
              ? Math.round(rows.reduce((s, r) => s + num(r, "zones"), 0) / rows.length)
              : "—",
            icon: Warehouse,
            accent: "accent",
          },
        ];
      }}
    />
  );
}
