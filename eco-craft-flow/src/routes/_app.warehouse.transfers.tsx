import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, CheckCircle2, Clock, Package } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/warehouse/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  return (
    <EntityListPage
      entity="stock_transfers"
      kpis={(rows) => [
        { label: "Transfers", value: rows.length, icon: ArrowLeftRight },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: Clock, accent: "secondary" },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
        { label: "Lots", value: new Set(rows.map((r) => r.fields.lot).filter(Boolean)).size, icon: Package, accent: "muted" },
      ]}
    />
  );
}
