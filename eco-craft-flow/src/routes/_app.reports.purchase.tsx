import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, PackageCheck, Star, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReportToolbar, type PeriodId } from "@/components/common/ReportToolbar";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/purchase")({ component: PurchaseReport });

function PurchaseReport() {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodId>("30d");
  const suppliers = useRecords("suppliers");
  const pos = useRecords("purchase_orders");
  const grns = useRecords("grns");

  const rows = useMemo(
    () =>
      suppliers
        .map((s) => {
          const supplierPos = pos.filter((p) => str(p, "supplier") === s.code || str(p, "supplierName") === s.title);
          const supplierGrns = grns.filter((g) => str(g, "supplierName") === s.title);
          const ordered = supplierPos.reduce((t, p) => t + recordTotal(p), 0);
          const received = supplierGrns.reduce((t, g) => t + num(g, "acceptedQty") * (g.lines[0]?.rate ?? 0), 0);
          const rejected = supplierGrns.filter((g) => str(g, "inspection") === "Failed").length;
          return {
            name: s.title,
            type: str(s, "category"),
            rating: num(s, "rating"),
            pos: supplierPos.length,
            ordered,
            received,
            outstanding: num(s, "outstanding"),
            quality: supplierGrns.length ? Math.round(((supplierGrns.length - rejected) / supplierGrns.length) * 100) : 100,
          };
        })
        .sort((a, b) => b.ordered - a.ordered),
    [suppliers, pos, grns],
  );

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const ordered = rows.reduce((t, r) => t + r.ordered, 0);
  const received = rows.reduce((t, r) => t + r.received, 0);
  const payable = rows.reduce((t, r) => t + r.outstanding, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ordered Value" value={npr(ordered)} icon={Truck} />
        <KpiCard label="Received Value" value={npr(received)} icon={PackageCheck} accent="secondary" />
        <KpiCard label="Payable" value={npr(payable)} icon={Banknote} accent="accent" />
        <KpiCard label="Active Suppliers" value={suppliers.length} icon={Star} accent="muted" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <ReportToolbar
            query={q}
            onQuery={setQ}
            placeholder="Search supplier..."
            period={period}
            onPeriod={setPeriod}
            filename="purchase-report"
            rows={filtered.map((r) => ({
              Supplier: r.name,
              Type: r.type,
              POs: r.pos,
              Ordered: r.ordered,
              Received: r.received,
              Outstanding: r.outstanding,
              "Quality %": r.quality,
            }))}
          />

          <div className="mt-4 grid gap-3 md:hidden">
            {filtered.map((r) => (
              <div key={r.name} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.type} · {r.pos} POs
                    </div>
                  </div>
                  <StatusBadge tone={r.quality >= 95 ? "success" : r.quality >= 80 ? "warning" : "danger"}>
                    {r.quality}% QC
                  </StatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Ordered </span>
                    <span className="font-medium">{npr(r.ordered)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Payable </span>
                    <span className="font-medium">{npr(r.outstanding)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">POs</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.type}</TableCell>
                    <TableCell className="text-right">{r.pos}</TableCell>
                    <TableCell className="text-right">{npr(r.ordered)}</TableCell>
                    <TableCell className="text-right">{npr(r.received)}</TableCell>
                    <TableCell className="text-right">{npr(r.outstanding)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={r.quality >= 95 ? "success" : r.quality >= 80 ? "warning" : "danger"}>
                        {r.quality}%
                      </StatusBadge>
                    </TableCell>
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
