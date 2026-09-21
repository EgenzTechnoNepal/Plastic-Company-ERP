import { Boxes, ChartColumn, IndianRupee, Layers } from "lucide-react";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { abcAnalysis } from "@/features/inventory/analytics";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { num, searchRecord } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export function AbcPage() {
  const products = useRecords("products");
  const rows = abcAnalysis(products);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Stock value" value={npr(total)} icon={IndianRupee} />
        <KpiCard label="Class A" value={rows.filter((r) => r.suggested === "A").length} icon={Layers} accent="accent" hint="~80% of value" />
        <KpiCard label="Class B" value={rows.filter((r) => r.suggested === "B").length} icon={ChartColumn} accent="secondary" />
        <KpiCard label="Class C" value={rows.filter((r) => r.suggested === "C").length} icon={Boxes} accent="muted" />
      </div>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.product.id}
        exportName="abc-analysis"
        emptyMessage="No products."
        search={(row, q) => searchRecord(row.product, q, ["code", "title", "fields.abcClass"])}
        searchPlaceholder="Search SKUs…"
        rowHref={(row) => recordPath("products", row.product.code)}
        columns={[
          { key: "code", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.product.code}</span>, value: (r) => r.product.code },
          { key: "name", header: "Product", cell: (r) => r.product.title, value: (r) => r.product.title },
          { key: "onHand", header: "On hand", align: "right", cell: (r) => num(r.product, "onHand").toLocaleString("en-IN"), value: (r) => num(r.product, "onHand") },
          { key: "value", header: "Value", align: "right", cell: (r) => npr(r.value), value: (r) => r.value },
          { key: "share", header: "Share", align: "right", cell: (r) => `${(r.share * 100).toFixed(1)}%`, value: (r) => r.share },
          { key: "cum", header: "Cumulative", align: "right", cell: (r) => `${(r.cumulative * 100).toFixed(1)}%`, value: (r) => r.cumulative },
          {
            key: "suggested",
            header: "Suggested",
            cell: (r) => <StatusBadge tone={r.suggested === "A" ? "success" : r.suggested === "B" ? "info" : "neutral"}>{r.suggested}</StatusBadge>,
            value: (r) => r.suggested,
          },
          { key: "current", header: "On item", cell: (r) => r.current, value: (r) => r.current },
        ]}
      />
    </div>
  );
}
