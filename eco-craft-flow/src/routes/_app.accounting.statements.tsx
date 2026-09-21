import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/common/KpiCard";
import { downloadXls, npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/statements")({ component: StatementsPage });

function StatementsPage() {
  const accounts = useRecords("accounts");
  const [view, setView] = useState<"tb" | "pl" | "bs" | "cf">("tb");

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) {
      const g = str(a, "group") || "Other";
      map.set(g, (map.get(g) ?? 0) + num(a, "balance"));
    }
    return map;
  }, [accounts]);

  const income = groups.get("Income") ?? 0;
  const expense = groups.get("Expense") ?? 0;
  const assets = groups.get("Asset") ?? 0;
  const liabilities = groups.get("Liability") ?? 0;
  const equity = groups.get("Equity") ?? 0;
  const profit = income - expense;

  const tbRows = accounts.map((a) => {
    const bal = num(a, "balance");
    const g = str(a, "group");
    const debit = g === "Asset" || g === "Expense" ? Math.max(bal, 0) : 0;
    const credit = g === "Liability" || g === "Equity" || g === "Income" ? Math.max(bal, 0) : 0;
    return { code: a.code, title: a.title, group: g, debit, credit };
  });

  const exportRows = () => {
    if (view === "tb") downloadXls("trial-balance", tbRows.map((r) => ({ Code: r.code, Account: r.title, Group: r.group, Debit: r.debit, Credit: r.credit })));
    if (view === "pl") downloadXls("profit-and-loss", [{ Income: income, Expense: expense, Profit: profit }]);
    if (view === "bs") downloadXls("balance-sheet", [{ Assets: assets, Liabilities: liabilities, Equity: equity, Retained: profit }]);
    if (view === "cf") downloadXls("cash-flow", [{ Operating: profit, Investing: 0, Financing: 0 }]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {([
          ["tb", "Trial balance"],
          ["pl", "Profit & loss"],
          ["bs", "Balance sheet"],
          ["cf", "Cash flow"],
        ] as const).map(([id, label]) => (
          <Button key={id} size="sm" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>
            {label}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportRows}>
          Export Excel
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          Print / PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Income" value={npr(income)} icon={TrendingUp} />
        <KpiCard label="Expense" value={npr(expense)} icon={TrendingDown} accent="accent" />
        <KpiCard label="Net profit" value={npr(profit)} icon={Wallet} accent="secondary" />
        <KpiCard label="Assets" value={npr(assets)} icon={Scale} accent="muted" />
      </div>

      {view === "tb" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Trial balance</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-2">Code</th><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody>
                {tbRows.map((r) => (
                  <tr key={r.code} className="border-t">
                    <td className="py-2 font-mono text-xs">
                      <Link
                        to={"/accounting/ledger" as never}
                        search={{ account: r.code } as never}
                        className="text-primary hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td>{r.title}</td>
                    <td className="text-right">{npr(r.debit)}</td>
                    <td className="text-right">{npr(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {view === "pl" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Profit & loss</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Income" value={income} />
            <Row label="Expense" value={expense} />
            <Row label="Net profit" value={profit} bold />
          </CardContent>
        </Card>
      )}
      {view === "bs" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Balance sheet</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="mb-2 font-semibold">Assets</p>
              <Row label="Total assets" value={assets} bold />
            </div>
            <div>
              <p className="mb-2 font-semibold">Equity & liabilities</p>
              <Row label="Liabilities" value={liabilities} />
              <Row label="Equity" value={equity} />
              <Row label="Retained earnings" value={profit} />
              <Row label="Total" value={liabilities + equity + profit} bold />
            </div>
          </CardContent>
        </Card>
      )}
      {view === "cf" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cash flow (indirect)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Operating (net profit proxy)" value={profit} />
            <Row label="Investing" value={0} />
            <Row label="Financing" value={0} />
            <Row label="Net change in cash" value={profit} bold />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{npr(value)}</span>
    </div>
  );
}
