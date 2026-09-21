import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Landmark, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/common/KpiCard";
import { npr } from "@/lib/export";
import { num, str, sumField } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/cash-bank")({ component: CashBankPage });

function accountKind(r: { title: string; code: string }) {
  const t = `${r.title} ${r.code}`.toLowerCase();
  if (t.includes("cash")) return "cash" as const;
  if (t.includes("esewa") || t.includes("khalti") || t.includes("wallet")) return "wallet" as const;
  return "bank" as const;
}

const KIND_ICON = { bank: Landmark, cash: Wallet, wallet: Smartphone } as const;

function CashBankPage() {
  const accounts = useRecords("accounts").filter((a) => {
    const t = `${a.title} ${a.code}`.toLowerCase();
    return t.includes("cash") || t.includes("bank") || a.code.startsWith("11");
  });
  const expenses = useRecords("expenses");
  const invoices = useRecords("invoices");
  const vendorPayments = useRecords("vendor_payments");

  const totalBalance = sumField(accounts, "balance");
  const income = invoices.reduce((s, r) => s + num(r, "paid"), 0);
  const outflow = sumField(expenses, "amount") + vendorPayments.reduce((s, r) => s + num(r, "amount"), 0);
  const profit = income - sumField(expenses, "amount");
  const maxBalance = Math.max(...accounts.map((a) => num(a, "balance")), 1);

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const inv of invoices) {
    const m = inv.date.slice(0, 7);
    const cur = byMonth.get(m) ?? { income: 0, expense: 0 };
    cur.income += num(inv, "paid") || 0;
    byMonth.set(m, cur);
  }
  for (const exp of expenses) {
    const m = exp.date.slice(0, 7);
    const cur = byMonth.get(m) ?? { income: 0, expense: 0 };
    cur.expense += num(exp, "amount");
    byMonth.set(m, cur);
  }
  const months = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
  const maxMonth = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Balance" value={npr(totalBalance)} hint="cash & bank" icon={Landmark} />
        <KpiCard label="Inflow" value={npr(income)} icon={ArrowDownLeft} accent="accent" />
        <KpiCard label="Outflow" value={npr(outflow)} icon={ArrowUpRight} accent="secondary" />
        <KpiCard label="Net (collections − expenses)" value={npr(profit)} icon={TrendingUp} accent="muted" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 sm:pt-2">
          {accounts.map((a) => {
            const kind = accountKind(a);
            const Icon = KIND_ICON[kind];
            const bal = num(a, "balance");
            return (
              <div key={a.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{a.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.code} · {str(a, "group")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className="font-semibold">{npr(bal)}</div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(bal / maxBalance) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Income vs Expense</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-2">
          {months.length === 0 && <p className="text-sm text-muted-foreground">No posted collections or expenses yet.</p>}
          {months.map((m) => (
            <div key={m.month}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{m.month}</span>
                <span className="text-muted-foreground">
                  Profit <span className="font-medium text-foreground">{npr(m.income - m.expense)}</span>
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(m.income / maxMonth) * 100}%` }} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-destructive/70" style={{ width: `${(m.expense / maxMonth) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-primary" /> Collections
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-destructive/70" /> Expenses
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
