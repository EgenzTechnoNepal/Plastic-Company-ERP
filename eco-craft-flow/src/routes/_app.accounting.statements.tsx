import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { KpiCard } from "@/components/common/KpiCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_V1 } from "@/services/api/endpoints";
import { apiFetchMeta } from "@/services/api/client";
import { useAuthStore } from "@/store/auth";
import { downloadXls, npr } from "@/lib/export";

export const Route = createFileRoute("/_app/accounting/statements")({ component: StatementsPage });

const PAGE_SIZE = 25;

interface StatementRow {
  code: string;
  title: string;
  group: string;
  debit: number;
  credit: number;
}

interface StatementPayload {
  trial_balance: StatementRow[];
  profit_and_loss: {
    income: number;
    expense: number;
    profit: number;
  };
  balance_sheet: {
    assets: number;
    liabilities: number;
    equity: number;
    retained: number;
  };
  cash_flow: {
    operating: number;
    investing: number;
    financing: number;
  };
}

function isStatementPayload(value: unknown): value is StatementPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  const isNumber = (item: unknown) => typeof item === "number" && Number.isFinite(item);
  const isTotals = (item: unknown, keys: string[]) =>
    Boolean(item && typeof item === "object" && keys.every((key) => isNumber((item as Record<string, unknown>)[key])));

  return (
    Array.isArray(payload.trial_balance) &&
    payload.trial_balance.every((row: unknown) => {
      if (!row || typeof row !== "object") return false;
      const item = row as Record<string, unknown>;
      return (
        typeof item.code === "string" &&
        typeof item.title === "string" &&
        typeof item.group === "string" &&
        isNumber(item.debit) &&
        isNumber(item.credit)
      );
    }) &&
    isTotals(payload.profit_and_loss, ["income", "expense", "profit"]) &&
    isTotals(payload.balance_sheet, ["assets", "liabilities", "equity", "retained"]) &&
    isTotals(payload.cash_flow, ["operating", "investing", "financing"])
  );
}

function StatementsPage() {
  const live = useAuthStore((state) => state.source === "api");
  const [view, setView] = useState<"tb" | "pl" | "bs" | "cf">("tb");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  const statementQuery = useQuery({
    queryKey: ["accounting-statements", { startDate, endDate, page, pageSize: PAGE_SIZE }],
    queryFn: async ({ signal }) => {
      const result = await apiFetchMeta<unknown>(`${API_V1}/accounting/statements/`, {
        query: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
        silent: true,
      });
      if (!isStatementPayload(result.data)) {
        throw new Error("The statement API returned an unexpected response.");
      }
      return { ...result, data: result.data };
    },
    enabled: live,
    retry: 1,
  });

  const statement = statementQuery.error ? undefined : statementQuery.data?.data;
  const rows = statement?.trial_balance ?? [];
  const meta = statementQuery.data?.meta;
  const totalCount = meta?.count ?? rows.length;
  const totalPages = Math.max(1, meta?.num_pages ?? Math.ceil(totalCount / PAGE_SIZE));

  const applyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftStartDate && draftEndDate && draftStartDate > draftEndDate) {
      setValidationError("Start Date must be on or before End Date.");
      return;
    }
    setValidationError(null);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setPage(1);
  };

  const clearFilter = () => {
    setDraftStartDate("");
    setDraftEndDate("");
    setStartDate("");
    setEndDate("");
    setValidationError(null);
    setPage(1);
  };

  const exportRows = () => {
    if (!statement) return;
    if (view === "tb") {
      downloadXls(
        "trial-balance",
        rows.map((row) => ({
          Code: row.code,
          Account: row.title,
          Group: row.group,
          Debit: row.debit,
          Credit: row.credit,
        })),
      );
    }
    if (view === "pl") {
      downloadXls("profit-and-loss", [statement.profit_and_loss]);
    }
    if (view === "bs") {
      downloadXls("balance-sheet", [statement.balance_sheet]);
    }
    if (view === "cf") {
      downloadXls("cash-flow", [statement.cash_flow]);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={applyFilter} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label htmlFor="statement-start-date" className="grid gap-1.5 text-sm font-medium">
            Start Date
            <Input
              id="statement-start-date"
              type="date"
              value={draftStartDate}
              onChange={(event) => setDraftStartDate(event.target.value)}
              disabled={!live}
            />
          </label>
          <label htmlFor="statement-end-date" className="grid gap-1.5 text-sm font-medium">
            End Date
            <Input
              id="statement-end-date"
              type="date"
              value={draftEndDate}
              onChange={(event) => setDraftEndDate(event.target.value)}
              disabled={!live}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!live || statementQuery.isFetching}>
            {statementQuery.isFetching ? "Searching…" : "Apply"}
          </Button>
          <Button type="button" variant="outline" onClick={clearFilter} disabled={!live}>
            Clear
          </Button>
        </div>
      </form>

      {validationError && (
        <p role="alert" className="text-sm text-destructive">{validationError}</p>
      )}
      {!live && (
        <p role="alert" className="text-sm text-destructive">
          Statement data requires a live API connection; demo data is not used for this report.
        </p>
      )}
      {statementQuery.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{statementQuery.error instanceof Error ? statementQuery.error.message : "Unable to load statements."}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void statementQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {live && statementQuery.isPending && (
        <p role="status" className="text-sm text-muted-foreground">Loading statements…</p>
      )}

      {statement && (
        <>
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
            <KpiCard label="Income" value={npr(statement.profit_and_loss.income)} icon={TrendingUp} />
            <KpiCard label="Expense" value={npr(statement.profit_and_loss.expense)} icon={TrendingDown} accent="accent" />
            <KpiCard label="Net profit" value={npr(statement.profit_and_loss.profit)} icon={Wallet} accent="secondary" />
            <KpiCard label="Assets" value={npr(statement.balance_sheet.assets)} icon={Scale} accent="muted" />
          </div>

          {view === "tb" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Trial balance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {rows.length === 0 ? (
                  <EmptyState title="No statement rows" description="No trial-balance records match the selected dates." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2">Code</th>
                        <th>Account</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.code} className="border-t">
                          <td className="py-2 font-mono text-xs">
                            <Link
                              to={"/accounting/ledger" as never}
                              search={{ account: row.code } as never}
                              className="text-primary hover:underline"
                            >
                              {row.code}
                            </Link>
                          </td>
                          <td>{row.title}</td>
                          <td className="text-right">{npr(row.debit)}</td>
                          <td className="text-right">{npr(row.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-sm">
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages} · {totalCount} rows
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page <= 1 || statementQuery.isFetching}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages || statementQuery.isFetching}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {view === "pl" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Profit &amp; loss</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Income" value={statement.profit_and_loss.income} />
                <Row label="Expense" value={statement.profit_and_loss.expense} />
                <Row label="Net profit" value={statement.profit_and_loss.profit} bold />
              </CardContent>
            </Card>
          )}
          {view === "bs" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Balance sheet</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="mb-2 font-semibold">Assets</p>
                  <Row label="Total assets" value={statement.balance_sheet.assets} bold />
                </div>
                <div>
                  <p className="mb-2 font-semibold">Equity &amp; liabilities</p>
                  <Row label="Liabilities" value={statement.balance_sheet.liabilities} />
                  <Row label="Equity" value={statement.balance_sheet.equity} />
                  <Row label="Retained earnings" value={statement.balance_sheet.retained} />
                </div>
              </CardContent>
            </Card>
          )}
          {view === "cf" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Cash flow</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Operating" value={statement.cash_flow.operating} />
                <Row label="Investing" value={statement.cash_flow.investing} />
                <Row label="Financing" value={statement.cash_flow.financing} />
              </CardContent>
            </Card>
          )}
        </>
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
