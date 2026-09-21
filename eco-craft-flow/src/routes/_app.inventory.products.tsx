import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Boxes, IndianRupee, Layers } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { isLowStock, stockValue, str } from "@/lib/records";

export const Route = createFileRoute("/_app/inventory/products")({
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <EntityListPage
      entity="products"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Raw Material", "Semi-Finished", "Finished Good", "Consumable"].map((v) => ({
            value: v,
            label: v,
          })),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "SKUs", value: rows.length, icon: Boxes },
        { label: "Stock Value", value: npr(rows.reduce((s, r) => s + stockValue(r), 0)), icon: IndianRupee },
        { label: "Low Stock", value: rows.filter(isLowStock).length, icon: AlertTriangle, accent: "muted" },
        { label: "Finished Goods", value: rows.filter((r) => str(r, "type") === "Finished Good").length, icon: Layers, accent: "accent" },
      ]}
    />
  );
}
