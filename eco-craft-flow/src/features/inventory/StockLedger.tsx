import { useMemo, useState } from "react";
import { BookOpen, Boxes, IndianRupee, Warehouse } from "lucide-react";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { npr } from "@/lib/export";
import { movementLedger } from "@/features/inventory/analytics";
import { recordPath } from "@/features/registry/paths";
import { num, searchRecord, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export function StockLedgerPage() {
  const products = useRecords("products");
  const movements = useRecords("stock_movements");
  const [sku, setSku] = useState(products[0]?.code ?? "");
  const code = sku || products[0]?.code || "";
  const product = products.find((p) => p.code === code);
  const rows = useMemo(() => movementLedger(movements, code), [movements, code]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="SKU" value={code || "—"} icon={Boxes} />
        <KpiCard label="On hand" value={(product ? num(product, "onHand") : 0).toLocaleString("en-IN")} icon={Warehouse} accent="secondary" />
        <KpiCard label="Movements" value={rows.length} icon={BookOpen} accent="muted" />
        <KpiCard label="Rate" value={product ? npr(num(product, "rate")) : "—"} icon={IndianRupee} accent="accent" />
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Product</span>
        <select
          className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm"
          value={code}
          onChange={(e) => setSku(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.title}
            </option>
          ))}
        </select>
      </label>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.movement.id}
        exportName={`stock-ledger-${code}`}
        emptyMessage="No ledger lines for this SKU."
        search={(row, q) => searchRecord(row.movement, q, ["code", "fields.type", "fields.reference", "fields.warehouse"])}
        searchPlaceholder="Search movements…"
        rowHref={(row) => recordPath("stock_movements", row.movement.code)}
        columns={[
          { key: "date", header: "Date", cell: (r) => r.movement.date, value: (r) => r.movement.date },
          { key: "ref", header: "Ref", cell: (r) => <span className="font-mono text-xs">{r.movement.code}</span>, value: (r) => r.movement.code },
          { key: "type", header: "Type", cell: (r) => str(r.movement, "type"), value: (r) => str(r.movement, "type") },
          { key: "doc", header: "Document", cell: (r) => str(r.movement, "reference") || "—", value: (r) => str(r.movement, "reference") },
          { key: "wh", header: "Warehouse", cell: (r) => str(r.movement, "warehouse"), value: (r) => str(r.movement, "warehouse") },
          { key: "qty", header: "Qty", align: "right", cell: (r) => `${r.qty > 0 ? "+" : ""}${r.qty.toLocaleString("en-IN")}`, value: (r) => r.qty },
          { key: "bal", header: "Balance", align: "right", cell: (r) => r.balance.toLocaleString("en-IN"), value: (r) => r.balance },
        ]}
      />
    </div>
  );
}
