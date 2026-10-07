import { createFileRoute } from "@tanstack/react-router";
import { Calculator, Package, ReceiptText } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/landed-cost")({
  component: LandedCostPage,
});

function money(value: number) {
  return nf.format(Math.round(value));
}

function LandedCostPage() {
  return (
    <EntityListPage
      entity="landed_cost_documents"
      kpis={(rows) => [
        { label: "Documents", value: rows.length, icon: ReceiptText },
        { label: "Material Cost", value: money(sumField(rows, "purchaseValue")), icon: Calculator },
        { label: "Posted", value: rows.filter((r) => String(r.fields.serverStatus ?? r.status).toUpperCase() === "POSTED").length, icon: Package, accent: "accent" },
      ]}
    />
  );
}
