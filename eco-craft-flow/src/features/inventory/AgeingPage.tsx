import { Clock, IndianRupee, PackageMinus, Timer } from "lucide-react";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ageingClass, daysIdle, lastMoveDate } from "@/features/inventory/analytics";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { num, searchRecord, stockValue, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export function AgeingPage() {
  const products = useRecords("products");
  const movements = useRecords("stock_movements");
  const rows = products.map((p) => {
    const last = lastMoveDate(movements, p.code);
    const days = daysIdle(last, p.date);
    return { product: p, last, days, klass: ageingClass(days) };
  });
  const slow = rows.filter((r) => r.klass !== "Fast");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="SKUs" value={rows.length} icon={Clock} />
        <KpiCard label="Slow-moving" value={rows.filter((r) => r.klass === "Slow-moving").length} icon={Timer} accent="secondary" />
        <KpiCard label="Non-moving" value={rows.filter((r) => r.klass === "Non-moving").length} icon={PackageMinus} accent="muted" />
        <KpiCard label="Tied value" value={npr(slow.reduce((s, r) => s + stockValue(r.product), 0))} icon={IndianRupee} accent="accent" />
      </div>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.product.id}
        exportName="stock-ageing"
        emptyMessage="No products."
        search={(row, q) => searchRecord(row.product, q, ["code", "title"])}
        searchPlaceholder="Search SKUs…"
        rowHref={(row) => recordPath("products", row.product.code)}
        columns={[
          { key: "code", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.product.code}</span>, value: (r) => r.product.code },
          { key: "name", header: "Product", cell: (r) => r.product.title, value: (r) => r.product.title },
          { key: "onHand", header: "On hand", align: "right", cell: (r) => num(r.product, "onHand").toLocaleString("en-IN"), value: (r) => num(r.product, "onHand") },
          { key: "last", header: "Last move", cell: (r) => r.last || r.product.date, value: (r) => r.last || r.product.date },
          { key: "days", header: "Days idle", align: "right", cell: (r) => r.days, value: (r) => r.days },
          {
            key: "class",
            header: "Class",
            cell: (r) => <StatusBadge tone={r.klass === "Fast" ? "success" : r.klass === "Slow-moving" ? "warning" : "danger"}>{r.klass}</StatusBadge>,
            value: (r) => r.klass,
          },
          { key: "value", header: "Value", align: "right", cell: (r) => npr(stockValue(r.product)), value: (r) => stockValue(r.product) },
          { key: "wh", header: "Warehouse", cell: (r) => str(r.product, "warehouse"), value: (r) => str(r.product, "warehouse") },
        ]}
      />
    </div>
  );
}
