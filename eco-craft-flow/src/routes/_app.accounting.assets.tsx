import { createFileRoute } from "@tanstack/react-router";
import { Building2, IndianRupee, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";

export const Route = createFileRoute("/_app/accounting/assets")({
  component: AssetsPage,
});

function AssetsPage() {
  return (
    <EntityListPage
      entity="assets"
      extraFilters={[
        {
          key: "category",
          placeholder: "All categories",
          options: ["Plant & Machinery", "Vehicles", "Furniture", "IT Equipment", "Building"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "category") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Assets", value: rows.length, icon: Building2 },
        { label: "Acquisition cost", value: npr(rows.reduce((s, r) => s + num(r, "cost"), 0)), icon: IndianRupee, accent: "secondary" },
        { label: "WDV", value: npr(rows.reduce((s, r) => s + num(r, "wdv"), 0)), icon: Truck, accent: "muted" },
      ]}
    />
  );
}
