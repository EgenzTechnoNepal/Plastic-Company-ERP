import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Factory,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wallet,
  AlertTriangle,
  ClipboardList,
  Plus,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { compactNpr, npr } from "@/lib/export";
import { isLowStock, num, statusLabel, statusTone, stockValue, str } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";
import { useAuthStore } from "@/store/auth";
import { useDashboardSummary } from "@/services/api/dashboard";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function monthLabel(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 7);
  return d.toLocaleString("en-US", { month: "short" });
}

function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const live = useAuthStore((s) => s.source === "api");
  const { data: summary, error: summaryError, refetch: refetchSummary } = useDashboardSummary();
  const invoices = useRecords("invoices");
  const salesOrders = useRecords("sales_orders");
  const purchaseOrders = useRecords("purchase_orders");
  const products = useRecords("products");
  const customers = useRecords("customers");
  const suppliers = useRecords("suppliers");
  const workOrders = useRecords("work_orders");

  const invoiced = summary
    ? Number(summary.sales.posted_invoice_total || 0)
    : invoices.reduce((s, r) => s + recordTotal(r), 0);
  const openPos = summary
    ? summary.purchase.open_purchase_orders
    : purchaseOrders.filter((r) => !["completed", "cancelled", "posted"].includes(r.status)).length;
  const openSos = summary
    ? summary.sales.open_sales_orders
    : salesOrders.filter((r) => !["completed", "cancelled", "posted"].includes(r.status)).length;
  const low = products.filter(isLowStock);
  const qcHold = summary?.inventory.lots_qc_hold ?? 0;
  const availableLots = summary?.inventory.lots_available ?? 0;

  const byMonth = new Map<string, { m: string; sales: number; production: number; purchase: number }>();
  const bump = (date: string) => {
    const key = date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { m: monthLabel(date), sales: 0, production: 0, purchase: 0 });
    return byMonth.get(key)!;
  };
  for (const inv of invoices) bump(inv.date).sales += recordTotal(inv) / 100_000;
  for (const wo of workOrders) bump(wo.date).production += num(wo, "producedQty") / 10_000;
  for (const po of purchaseOrders) bump(po.date).purchase += recordTotal(po) / 100_000;
  const chart = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  const recent = [...salesOrders]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
        description={
          live && summary
            ? `Live KPIs from ${summary.company_name} (typed database).`
            : "Operational snapshot — connect API login for live typed KPIs."
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports">
                <ClipboardList className="mr-2 h-4 w-4" /> Reports
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/sales">
                <Plus className="mr-2 h-4 w-4" /> New Sales Order
              </Link>
            </Button>
          </>
        }
      />

      {live && summaryError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>
            Live dashboard summary failed to load ({summaryError instanceof Error ? summaryError.message : "request failed"}).
            KPIs below are incomplete.
          </span>
          <Button size="sm" variant="outline" onClick={() => void refetchSummary()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Invoiced Sales"
          value={compactNpr(invoiced)}
          hint={summary ? `${summary.sales.posted_invoices} posted invoices` : `${invoices.length} invoices`}
          icon={ShoppingCart}
        />
        <KpiCard
          label="Lots Available"
          value={summary ? availableLots : products.filter((p) => num(p, "available") > 0 || num(p, "onHand") > 0).length}
          hint={summary ? `QC hold: ${qcHold}` : "from products"}
          icon={Boxes}
          accent="accent"
        />
        <KpiCard
          label="Open POs"
          value={openPos}
          hint={
            summary
              ? npr(Number(summary.purchase.open_po_line_value || 0))
              : npr(purchaseOrders.reduce((s, r) => s + recordTotal(r), 0))
          }
          icon={Truck}
          accent="secondary"
        />
        <KpiCard
          label="Open SOs"
          value={openSos}
          hint={summary ? `Reserved qty ${summary.inventory.reserved_quantity}` : `${openSos} still in flow`}
          icon={ClipboardList}
          accent="muted"
        />
        <KpiCard
          label="Posted GRNs"
          value={summary ? summary.purchase.posted_grns : "—"}
          hint={summary ? `Bills ${summary.purchase.supplier_bills}` : "seed after login"}
          icon={Warehouse}
        />
        <KpiCard
          label="QC Open"
          value={summary ? summary.quality.open_inspections : "—"}
          hint={summary ? `Pass ${summary.quality.passed} / Fail ${summary.quality.failed}` : undefined}
          icon={AlertTriangle}
          accent="muted"
        />
        <KpiCard label="Customers" value={summary?.masters.customers ?? customers.length} icon={Users} />
        <KpiCard
          label="Suppliers"
          value={summary?.masters.suppliers ?? suppliers.length}
          icon={Warehouse}
          accent="secondary"
        />
        <KpiCard
          label="Items / Bins"
          value={summary ? `${summary.masters.items} / ${summary.masters.bins}` : products.length}
          icon={Factory}
          accent="accent"
        />
        <KpiCard
          label="Pending Approvals"
          value={summary?.workflow.pending_approvals ?? 0}
          hint="typed ApprovalRequest"
          icon={Wallet}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales vs Production (by month)</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="sales" name="Sales (L)" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line
                  type="monotone"
                  dataKey="production"
                  name="Output (10k pcs)"
                  stroke="var(--color-accent)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Purchase vs Sales (by month)</CardTitle>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="purchase" name="Purchase (L)" fill="var(--color-secondary)" radius={[8, 8, 0, 0]} />
                <Bar dataKey="sales" name="Sales (L)" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 shadow-sm lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Recent Sales Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sales">
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{str(r, "customerName") || r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.code}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold tabular-nums">{npr(recordTotal(r))}</span>
                    <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
                  </div>
                </li>
              ))}
              {recent.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">
                  No typed sales orders yet — create one after stock is AVAILABLE (seed_m2_demo_chain).
                </p>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Stock / QC snapshot</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inventory/ledger">
                Ledger <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary ? (
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Available lots</span>
                  <strong>{summary.inventory.lots_available}</strong>
                </li>
                <li className="flex justify-between">
                  <span>QC hold</span>
                  <strong>{summary.inventory.lots_qc_hold}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Quarantine</span>
                  <strong>{summary.inventory.lots_quarantined}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Reserved qty</span>
                  <strong>{summary.inventory.reserved_quantity}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Dispatches posted</span>
                  <strong>{summary.sales.posted_dispatches}</strong>
                </li>
              </ul>
            ) : (
              <ul className="space-y-3">
                {low.slice(0, 4).map((s) => {
                  const onHand = num(s, "onHand");
                  const min = num(s, "reorderLevel") || 1;
                  return (
                    <li key={s.id} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{s.code}</p>
                        </div>
                        <StatusBadge tone={onHand < min / 3 ? "danger" : "warning"}>{onHand} left</StatusBadge>
                      </div>
                    </li>
                  );
                })}
                {low.length === 0 && <p className="text-sm text-muted-foreground">No low-stock rows.</p>}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
