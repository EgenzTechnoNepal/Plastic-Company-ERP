import { createFileRoute } from "@tanstack/react-router";
import { Handshake, IndianRupee, Percent, Target } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/crm/dealers")({
  component: DealersPage,
});

function DealersPage() {
  return (
    <EntityListPage
      entity="dealers"
      kpis={(rows) => [
        { label: "Partners", value: rows.length, icon: Handshake },
        { label: "YTD Sales", value: npr(sumField(rows, "ytdSales")), icon: IndianRupee },
        { label: "Vs target", value: (() => {
          const target = sumField(rows, "target");
          const ach = sumField(rows, "achievement");
          return target ? `${Math.round((ach / target) * 100)}%` : "—";
        })(), icon: Target, accent: "secondary", hint: `${npr(sumField(rows, "achievement"))} / ${npr(sumField(rows, "target"))}` },
        { label: "Commission Earned", value: npr(sumField(rows, "commissionEarned")), icon: Percent, accent: "muted" },
      ]}
    />
  );
}
