import { createFileRoute } from "@tanstack/react-router";
import { IndianRupee, Star, Truck, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/suppliers")({
  component: SuppliersPage,
});

function SuppliersPage() {
  return (
    <EntityListPage
      entity="suppliers"
      extraFilters={[
        {
          key: "category",
          placeholder: "All categories",
          options: ["PLA/PBAT Resin", "Corn Starch", "Additives", "Packaging", "Services"].map((v) => ({
            value: v,
            label: v,
          })),
          match: (row, value) => str(row, "category") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Suppliers", value: rows.length, icon: Users },
        { label: "Payable", value: npr(sumField(rows, "outstanding")), icon: IndianRupee },
        { label: "Avg Rating", value: rows.length ? (sumField(rows, "rating") / rows.length).toFixed(1) : "—", icon: Star, accent: "secondary" },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: Truck, accent: "accent" },
      ]}
    />
  );
}
