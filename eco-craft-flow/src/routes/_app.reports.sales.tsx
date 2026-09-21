import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Banknote, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReportToolbar, type PeriodId } from "@/components/common/ReportToolbar";
import { npr } from "@/lib/export";
import { invoiceBalance, num, statusLabel, statusTone, str } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/sales")({ component: SalesReport });

function SalesReport() {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodId>("30d");
  const orders = useRecords("sales_orders");
  const invoices = useRecords("invoices");

  const rows = useMemo(() => {
    const byCustomer = new Map<string, { customer: string; orders: number; sales: number; collected: number }>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const name = str(o, "customerName") || o.title;
      const r = byCustomer.get(name) ?? { customer: name, orders: 0, sales: 0, collected: 0 };
      r.orders += 1;
      r.sales += recordTotal(o);
      byCustomer.set(name, r);
    }
    for (const inv of invoices) {
      const name = str(inv, "customerName") || inv.title;
      const r = byCustomer.get(name) ?? { customer: name, orders: 0, sales: 0, collected: 0 };
      r.collected += num(inv, "paid");
      byCustomer.set(name, r);
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.sales - a.sales);
  }, [orders, invoices]);

  const filtered = rows.filter((r) => r.customer.toLowerCase().includes(q.toLowerCase()));
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const collected = rows.reduce((s, r) => s + r.collected, 0);
  const overdue = invoices.filter((i) => invoiceBalance(i) > 0 && new Date(str(i, "dueDate")) < new Date());
  const overdueAmt = overdue.reduce((s, i) => s + invoiceBalance(i), 0);
  const max = Math.max(...rows.map((r) => r.sales), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Sales" value={npr(totalSales)} hint="excl. cancelled" icon={Banknote} />
        <KpiCard label="Collected" value={npr(collected)} icon={Wallet} accent="secondary" />
        <KpiCard label="Receivable" value={npr(totalSales - collected)} icon={AlertTriangle} accent="accent" />
        <KpiCard label="Overdue" value={npr(overdueAmt)} hint={`${overdue.length} invoices`} icon={Users} accent="muted" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <ReportToolbar
            query={q}
            onQuery={setQ}
            placeholder="Search customer..."
            period={period}
            onPeriod={setPeriod}
            filename="sales-report"
            rows={filtered.map((r) => ({
              Customer: r.customer,
              Orders: r.orders,
              Sales: r.sales,
              Collected: r.collected,
              Receivable: r.sales - r.collected,
            }))}
          />

          <div className="mt-4 grid gap-3 md:hidden">
            {filtered.map((r) => (
              <div key={r.customer} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate font-semibold">{r.customer}</div>
                  <StatusBadge tone="info">{r.orders} orders</StatusBadge>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.sales / max) * 100}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Sales </span>
                    <span className="font-medium">{npr(r.sales)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Due </span>
                    <span className="font-medium">{npr(r.sales - r.collected)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Receivable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.customer}>
                    <TableCell className="font-medium">{r.customer}</TableCell>
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="w-40">
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.sales / max) * 100}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{npr(r.sales)}</TableCell>
                    <TableCell className="text-right">{npr(r.collected)}</TableCell>
                    <TableCell className="text-right">{npr(r.sales - r.collected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice ageing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {invoices.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">
                  {i.code} · due {str(i, "dueDate") || "—"}
                </div>
                <div className="truncate font-medium">{str(i, "customerName") || i.title}</div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge tone={invoiceBalance(i) === 0 ? "success" : statusTone(i.status)}>
                  {invoiceBalance(i) === 0 ? "Paid" : statusLabel(i.status)}
                </StatusBadge>
                <span className="font-medium">{npr(invoiceBalance(i))}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
