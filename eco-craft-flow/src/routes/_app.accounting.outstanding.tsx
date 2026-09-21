import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, Scale, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { npr } from "@/lib/export";
import { buildOutstanding } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/outstanding")({ component: OutstandingPage });

function OutstandingPage() {
  const invoices = useRecords("invoices");
  const bills = useRecords("purchase_bills");
  const rows = useMemo(() => buildOutstanding(invoices, bills), [invoices, bills]);
  const [q, setQ] = useState("");
  const [side, setSide] = useState("all");

  const filtered = rows.filter((o) => {
    const t = q.toLowerCase();
    const matchesQ = !q || o.party.toLowerCase().includes(t) || o.reference.toLowerCase().includes(t);
    return matchesQ && (side === "all" || o.side === side);
  });

  const receivable = rows.filter((o) => o.side === "receivable").reduce((s, o) => s + o.balance, 0);
  const payable = rows.filter((o) => o.side === "payable").reduce((s, o) => s + o.balance, 0);
  const overdue = rows.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.balance, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Receivable" value={npr(receivable)} hint="from customers" icon={ArrowDownLeft} />
        <KpiCard label="Payable" value={npr(payable)} hint="to suppliers" icon={ArrowUpRight} accent="secondary" />
        <KpiCard label="Overdue" value={npr(overdue)} hint="past due date" icon={AlertTriangle} accent="accent" />
        <KpiCard label="Net Position" value={npr(receivable - payable)} icon={Scale} accent="muted" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search party or reference..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="receivable">Receivable</SelectItem>
                <SelectItem value="payable">Payable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((o) => (
              <div key={o.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{o.reference}</div>
                    <div className="mt-0.5 truncate font-semibold">{o.party}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Due {o.dueDate || "—"}</div>
                  </div>
                  <StatusBadge tone={o.daysOverdue > 0 ? "danger" : o.side === "receivable" ? "info" : "neutral"}>
                    {o.daysOverdue > 0 ? `${o.daysOverdue}d overdue` : o.side === "receivable" ? "Receivable" : "Payable"}
                  </StatusBadge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${o.total ? (o.paid / o.total) * 100 : 0}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Paid {npr(o.paid)} / {npr(o.total)}
                  </span>
                  <span className="font-semibold">{npr(o.balance)} due</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-2"
                  onClick={() => toast.success(`Reminder queued for ${o.reference} (simulated)`)}
                >
                  <Bell className="h-4 w-4" /> Send reminder
                </Button>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.party}</div>
                      <div className="text-xs capitalize text-muted-foreground">{o.side}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                    <TableCell className="text-sm">{o.dueDate || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={o.daysOverdue > 0 ? "danger" : "success"}>
                        {o.daysOverdue > 0 ? `${o.daysOverdue}d overdue` : "On time"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">{npr(o.total)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{npr(o.paid)}</TableCell>
                    <TableCell className="text-right font-medium">{npr(o.balance)}</TableCell>
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
