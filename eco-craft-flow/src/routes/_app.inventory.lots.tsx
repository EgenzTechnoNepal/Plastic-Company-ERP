import { createFileRoute } from "@tanstack/react-router";
import { Boxes, PackageCheck, ShieldAlert, ShieldX } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/lots")({
  component: LotsPage,
});

function LotsPage() {
  return (
    <EntityListPage
      entity="inventory_lots"
      kpis={(rows) => [
        { label: "Lots", value: rows.length, icon: Boxes },
        { label: "Available", value: rows.filter((r) => str(r, "lotStatus") === "AVAILABLE").length, icon: PackageCheck, accent: "accent" },
        { label: "QC hold", value: rows.filter((r) => str(r, "lotStatus") === "QC_HOLD").length, icon: ShieldAlert, accent: "secondary" },
        { label: "Blocked", value: rows.filter((r) => ["QUARANTINED", "REJECTED"].includes(str(r, "lotStatus"))).length, icon: ShieldX, accent: "muted" },
      ]}
    />
  );
}
