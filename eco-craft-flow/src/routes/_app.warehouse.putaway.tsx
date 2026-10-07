import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, PackageCheck, Warehouse } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/warehouse/putaway")({
  component: PutawayPage,
});

function PutawayPage() {
  return (
    <EntityListPage
      entity="putaways"
      kpis={(rows) => [
        { label: "Putaways", value: rows.length, icon: Warehouse },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: Clock, accent: "secondary" },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
        { label: "Lots", value: new Set(rows.map((r) => r.fields.lot).filter(Boolean)).size, icon: PackageCheck, accent: "muted" },
      ]}
    />
  );
}
