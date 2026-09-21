import { createFileRoute } from "@tanstack/react-router";
import { AlertOctagon, ClipboardList, IndianRupee, ShieldAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/ncr")({
  component: NcrPage,
});

function NcrPage() {
  return (
    <EntityListPage
      entity="ncrs"
      extraFilters={[
        {
          key: "severity",
          placeholder: "All severities",
          options: ["Minor", "Major", "Critical"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "severity") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "NCRs", value: rows.length, icon: ClipboardList },
        { label: "Open", value: rows.filter((r) => r.status === "open" || r.status === "in_progress").length, icon: ShieldAlert, accent: "muted" },
        { label: "Critical", value: rows.filter((r) => str(r, "severity") === "Critical").length, icon: AlertOctagon, accent: "secondary" },
        { label: "Cost Impact", value: npr(sumField(rows, "costImpact")), icon: IndianRupee },
      ]}
    />
  );
}
