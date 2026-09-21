import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertOctagon, Factory, Gauge, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReportToolbar, type PeriodId } from "@/components/common/ReportToolbar";
import { nf } from "@/lib/export";
import { num, statusLabel, statusTone, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/production")({ component: ProductionReport });

function ProductionReport() {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodId>("30d");
  const orders = useRecords("work_orders");
  const inspections = useRecords("qc_inspections");
  const quarantine = useRecords("quarantine");

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        const t = q.toLowerCase();
        return (
          !q ||
          str(o, "product").toLowerCase().includes(t) ||
          o.code.toLowerCase().includes(t) ||
          str(o, "machine").toLowerCase().includes(t)
        );
      }),
    [orders, q],
  );

  const planned = orders.reduce((s, o) => s + num(o, "plannedQty"), 0);
  const produced = orders.reduce((s, o) => s + num(o, "producedQty"), 0);
  const yieldPct = planned ? Math.round((produced / planned) * 100) : 0;
  const passed = inspections.filter((r) => str(r, "result") === "Pass").length;
  const passRate = inspections.length ? Math.round((passed / inspections.length) * 100) : 0;
  const held = quarantine.filter((x) => x.status === "hold").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Planned Qty" value={nf.format(planned)} icon={Factory} />
        <KpiCard label="Produced Qty" value={nf.format(produced)} hint={`${yieldPct}% of plan`} icon={Gauge} accent="secondary" />
        <KpiCard label="QC Pass Rate" value={`${passRate}%`} hint={`${inspections.length} inspections`} icon={ShieldCheck} accent="accent" />
        <KpiCard label="In Quarantine" value={held} icon={AlertOctagon} accent="muted" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <ReportToolbar
            query={q}
            onQuery={setQ}
            placeholder="Search order, product or machine..."
            period={period}
            onPeriod={setPeriod}
            filename="production-report"
            rows={rows.map((o) => ({
              Order: o.code,
              Product: str(o, "product"),
              Machine: str(o, "machine"),
              Supervisor: str(o, "supervisor"),
              Planned: num(o, "plannedQty"),
              Produced: num(o, "producedQty"),
              Status: statusLabel(o.status),
            }))}
          />

          <div className="mt-4 grid gap-3 md:hidden">
            {rows.map((o) => {
              const plan = num(o, "plannedQty") || 1;
              const pct = Math.min(100, Math.round((num(o, "producedQty") / plan) * 100));
              return (
                <div key={o.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {o.code} · {str(o, "machine")}
                      </div>
                      <div className="truncate font-semibold">{str(o, "product")}</div>
                    </div>
                    <StatusBadge tone={statusTone(o.status)}>{statusLabel(o.status)}</StatusBadge>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {nf.format(num(o, "producedQty"))} / {nf.format(num(o, "plannedQty"))} · {pct}%
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Machine / Supervisor</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Produced</TableHead>
                  <TableHead>Yield</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const plan = num(o, "plannedQty") || 1;
                  const pct = Math.min(100, Math.round((num(o, "producedQty") / plan) * 100));
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.code}</TableCell>
                      <TableCell className="font-medium">{str(o, "product")}</TableCell>
                      <TableCell className="text-sm">
                        <div>{str(o, "machine")}</div>
                        <div className="text-xs text-muted-foreground">{str(o, "supervisor")}</div>
                      </TableCell>
                      <TableCell className="text-right">{nf.format(num(o, "plannedQty"))}</TableCell>
                      <TableCell className="text-right">{nf.format(num(o, "producedQty"))}</TableCell>
                      <TableCell className="w-32">
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{pct}%</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(o.status)}>{statusLabel(o.status)}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QC summary by stage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-3 sm:p-6 sm:pt-0">
          {["Incoming", "In-Process", "Final"].map((label) => {
            const data = inspections.filter((r) => str(r, "stage") === label);
            const pass = data.filter((r) => str(r, "result") === "Pass").length;
            const pct = data.length ? Math.round((pass / data.length) * 100) : 0;
            return (
              <div key={label} className="rounded-lg border p-4">
                <div className="text-sm font-medium">{label}</div>
                <div className="mt-1 text-2xl font-semibold">{pct}%</div>
                <div className="text-xs text-muted-foreground">
                  {pass} passed of {data.length}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
