import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeftRight, Boxes, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReportToolbar, type PeriodId } from "@/components/common/ReportToolbar";
import { nf, npr } from "@/lib/export";
import { isLowStock, num, stockValue, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/inventory")({ component: InventoryReport });

const TYPES = ["Raw Material", "Semi-Finished", "Finished Good", "Consumable"] as const;

function InventoryReport() {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [kind, setKind] = useState<string>("all");
  const products = useRecords("products");
  const movements = useRecords("stock_movements");

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const t = q.toLowerCase();
        return (
          (!q || p.title.toLowerCase().includes(t) || p.code.toLowerCase().includes(t)) &&
          (kind === "all" || str(p, "type") === kind)
        );
      }),
    [products, q, kind],
  );

  const totalValue = products.reduce((s, p) => s + stockValue(p), 0);
  const lowCount = products.filter(isLowStock).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Stock Value" value={npr(totalValue)} icon={Coins} />
        <KpiCard label="SKUs" value={products.length} icon={Boxes} accent="secondary" />
        <KpiCard label="Below Reorder" value={lowCount} icon={AlertTriangle} accent="accent" />
        <KpiCard label="Movements" value={movements.length} icon={ArrowLeftRight} accent="muted" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <ReportToolbar
            query={q}
            onQuery={setQ}
            placeholder="Search product or SKU..."
            period={period}
            onPeriod={setPeriod}
            filename="inventory-valuation"
            rows={filtered.map((p) => ({
              SKU: p.code,
              Product: p.title,
              Type: str(p, "type"),
              Stock: num(p, "onHand"),
              Unit: str(p, "uom"),
              Reorder: num(p, "reorderLevel"),
              Cost: num(p, "rate"),
              Value: stockValue(p),
            }))}
            extra={
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-full min-w-40 sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TYPES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <div className="mt-4 grid gap-3 md:hidden">
            {filtered.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
                    <div className="truncate font-semibold">{p.title}</div>
                  </div>
                  <StatusBadge tone="info">{str(p, "type")}</StatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Stock </span>
                    <span className="font-medium">
                      {nf.format(num(p, "onHand"))} {str(p, "uom")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Value </span>
                    <span className="font-medium">{npr(stockValue(p))}</span>
                  </div>
                </div>
                {isLowStock(p) && (
                  <div className="mt-2 text-xs font-medium text-destructive">
                    Below reorder ({nf.format(num(p, "reorderLevel"))} {str(p, "uom")})
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>
                      <StatusBadge tone="info">{str(p, "type")}</StatusBadge>
                    </TableCell>
                    <TableCell className={`text-right ${isLowStock(p) ? "font-semibold text-destructive" : ""}`}>
                      {nf.format(num(p, "onHand"))} {str(p, "uom")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{nf.format(num(p, "reorderLevel"))}</TableCell>
                    <TableCell className="text-right">{npr(num(p, "rate"))}</TableCell>
                    <TableCell className="text-right font-medium">{npr(stockValue(p))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
