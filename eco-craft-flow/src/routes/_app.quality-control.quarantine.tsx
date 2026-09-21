import { createFileRoute } from "@tanstack/react-router";
import { Lock, Package, ShieldAlert, Unlock } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/quarantine")({
  component: QuarantinePage,
});

function QuarantinePage() {
  return (
    <EntityListPage
      entity="quarantine"
      kpis={(rows) => [
        { label: "Holds", value: rows.length, icon: ShieldAlert },
        { label: "Qty Held", value: nf.format(sumField(rows, "qty")), icon: Package },
        { label: "On Hold", value: rows.filter((r) => r.status === "hold").length, icon: Lock, accent: "muted" },
        { label: "Released", value: rows.filter((r) => r.status === "released").length, icon: Unlock, accent: "accent" },
      ]}
    />
  );
}
