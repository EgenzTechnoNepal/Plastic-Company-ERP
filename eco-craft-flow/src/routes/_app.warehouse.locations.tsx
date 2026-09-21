import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, MapPin, Package, Plus, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { Button } from "@/components/ui/button";
import { num, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/warehouse/locations")({
  component: LocationsPage,
});

function LocationsPage() {
  const warehouses = useRecords("warehouses");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <p className="text-sm text-foreground">
          <strong>Locations = bins</strong> inside a warehouse. Create the warehouse first, then add bins here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <Link to="/warehouse/warehouses">
              <Warehouse className="h-3.5 w-3.5" />
              All warehouses
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" asChild>
            <Link to="/warehouse/warehouses/new">
              <Plus className="h-3.5 w-3.5" />
              New Warehouse
            </Link>
          </Button>
        </div>
      </div>
      <EntityListPage
        entity="bins"
        extraFilters={[
          {
            key: "warehouse",
            placeholder: "All warehouses",
            options: warehouses.map((w) => ({ value: w.code, label: w.title || w.code })),
            match: (row, value) => str(row, "warehouse") === value,
          },
        ]}
      kpis={(rows) => {
        const occupied = rows.reduce((s, r) => s + num(r, "occupied"), 0);
        const capacity = rows.reduce((s, r) => s + num(r, "capacity"), 0);
        return [
          { label: "Bins", value: rows.length, icon: MapPin },
          { label: "Warehouses", value: new Set(rows.map((r) => str(r, "warehouse"))).size, icon: Warehouse },
          { label: "Occupied", value: occupied.toLocaleString("en-IN"), icon: Package, accent: "secondary" },
          { label: "Utilization", value: capacity ? `${Math.round((occupied / capacity) * 100)}%` : "—", icon: Boxes, accent: "muted" },
        ];
      }}
      />
    </div>
  );
}
