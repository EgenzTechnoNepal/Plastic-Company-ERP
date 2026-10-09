import { createFileRoute } from "@tanstack/react-router";
import { Boxes, CheckCircle2, Layers, ShieldCheck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

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
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: CheckCircle2, accent: "accent" },
        { label: "QC required", value: rows.filter((r) => Boolean(r.fields.qcRequired)).length, icon: ShieldCheck, accent: "secondary" },
        { label: "Finished Goods", value: rows.filter((r) => ["Finished Good", "FINISHED_GOOD"].includes(str(r, "type"))).length, icon: Layers, accent: "accent" },
      ]}
    />
  );
}
