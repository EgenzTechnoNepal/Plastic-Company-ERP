import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Percent, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReportToolbar, type PeriodId } from "@/components/common/ReportToolbar";
import { npr } from "@/lib/export";
import { buildOutstanding, num, str, sumField } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/financial")({ component: FinancialReport });

function FinancialReport() {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodId>("year");
  const accounts = useRecords("accounts");
  const expenses = useRecords("expenses");
  const invoices = useRecords("invoices");
  const bills = useRecords("purchase_bills");

  const income = accounts.filter((a) => str(a, "group") === "Income").reduce((s, a) => s + num(a, "balance"), 0);
  const expense = accounts.filter((a) => str(a, "group") === "Expense").reduce((s, a) => s + num(a, "balance"), 0);
  const profit = income - expense;
  const margin = income ? Math.round((profit / income) * 100) : 0;
  const cash = accounts
    .filter((a) => {
      const t = `${a.title} ${a.code}`.toLowerCase();
      return t.includes("cash") || t.includes("bank") || a.code.startsWith("11");
    })
    .reduce((s, a) => s + num(a, "balance"), 0);

  const months = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const inv of invoices) {
      const m = inv.date.slice(0, 7);
      const cur = map.get(m) ?? { income: 0, expense: 0 };
      cur.income += recordTotal(inv);
      map.set(m, cur);
    }
    for (const e of expenses) {
      const m = e.date.slice(0, 7);
      const cur = map.get(m) ?? { income: 0, expense: 0 };
      cur.expense += num(e, "amount");
      map.set(m, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [invoices, expenses]);
  const maxBar = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(str(e, "category") || "Other", (map.get(str(e, "category") || "Other") ?? 0) + num(e, "amount"));
    return Array.from(map, ([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);
  const filteredCats = categories.filter((c) => c.category.toLowerCase().includes(q.toLowerCase()));
  const catTotal = categories.reduce((s, c) => s + c.amount, 0) || 1;

  const outstanding = useMemo(() => buildOutstanding(invoices, bills), [invoices, bills]);
  const receivable = outstanding.filter((o) => o.side === "receivable").reduce((s, o) => s + o.balance, 0);
  const payable = outstanding.filter((o) => o.side === "payable").reduce((s, o) => s + o.balance, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Income" value={npr(income)} icon={TrendingUp} />
        <KpiCard label="Expense" value={npr(expense)} icon={TrendingDown} accent="accent" />
        <KpiCard label="Net Profit" value={npr(profit)} hint={`${margin}% margin`} icon={Percent} accent="secondary" />
        <KpiCard label="Cash & Bank" value={npr(cash)} icon={Wallet} accent="muted" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income vs expense by month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {months.map((m) => (
            <div key={m.month}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{m.month}</span>
                <span className="text-muted-foreground">{npr(m.income - m.expense)} profit</span>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(m.income / maxBar) * 100}%` }} />
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-destructive/70" style={{ width: `${(m.expense / maxBar) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">Green = invoiced sales · Red = expenses</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <ReportToolbar
            query={q}
            onQuery={setQ}
            placeholder="Search expense category..."
            period={period}
            onPeriod={setPeriod}
            filename="financial-report"
            rows={filteredCats.map((c) => ({
              Category: c.category,
              Amount: c.amount,
              "Share %": Math.round((c.amount / catTotal) * 100),
            }))}
          />

          <div className="mt-4 space-y-2">
            {filteredCats.map((c) => (
              <div key={c.category} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.category}</span>
                  <span>{npr(c.amount)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(c.amount / catTotal) * 100}%` }} />
                </div>
              </div>
            ))}
            {filteredCats.length === 0 && (
              <p className="text-sm text-muted-foreground">No expense categories yet. Posted total {npr(sumField(expenses, "amount"))}.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Receivable {npr(receivable)} · Payable {npr(payable)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-3 md:hidden">
            {outstanding.map((o) => (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.party}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {o.reference} · due {o.dueDate || "—"}
                    </div>
                  </div>
                  <StatusBadge tone={o.daysOverdue > 0 ? "danger" : o.side === "receivable" ? "info" : "warning"}>
                    {o.daysOverdue > 0 ? `${o.daysOverdue}d overdue` : o.side}
                  </StatusBadge>
                </div>
                <div className="mt-2 text-right text-sm font-semibold">{npr(o.balance)}</div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.party}</TableCell>
                    <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                    <TableCell className="text-sm capitalize">{o.side}</TableCell>
                    <TableCell>
                      <StatusBadge tone={o.daysOverdue > 0 ? "danger" : "neutral"}>
                        {o.daysOverdue > 0 ? `${o.daysOverdue}d overdue` : o.dueDate || "—"}
                      </StatusBadge>
                    </TableCell>
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
