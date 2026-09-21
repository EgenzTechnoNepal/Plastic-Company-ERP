import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { DualDate } from "@/components/common/DualDate";
import { npr } from "@/lib/export";
import { str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/ledger")({
  validateSearch: (s: Record<string, unknown>) => ({
    account: typeof s.account === "string" ? s.account : "",
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { account: filter } = Route.useSearch();
  const vouchers = useRecords("vouchers");
  const accounts = useRecords("accounts");

  const entries = useMemo(() => {
    const rows: Array<{
      voucherId: string;
      voucherCode: string;
      date: string;
      narration: string;
      account: string;
      debit: number;
      credit: number;
    }> = [];
    for (const v of vouchers) {
      for (const line of v.lines) {
        const account = line.account || line.item || "";
        if (filter && account !== filter && !account.includes(filter) && v.code !== filter) continue;
        rows.push({
          voucherId: v.id,
          voucherCode: v.code,
          date: v.date,
          narration: v.title || str(v, "narration"),
          account,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
        });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [vouchers, filter]);

  const debit = entries.reduce((s, e) => s + e.debit, 0);
  const credit = entries.reduce((s, e) => s + e.credit, 0);
  const title = filter
    ? accounts.find((a) => a.code === filter)?.title ?? filter
    : "All accounts";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account day book · {title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {filter ? (
            <p>
              Filtered to <span className="font-mono text-foreground">{filter}</span>.{" "}
              <Link
                        to="/accounting/ledger"
                        search={{ account: "" }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Clear
                      </Link>
            </p>
          ) : (
            <p>Click a trial-balance line on Statements to drill into that account.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {entries.length === 0 ? (
            <EmptyState title="No ledger lines" description="Post journal vouchers to populate the day book." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Date</th>
                  <th>Voucher</th>
                  <th>Account</th>
                  <th>Narration</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.voucherCode}-${i}`} className="border-t">
                    <td className="py-2"><DualDate value={e.date} /></td>
                    <td>
                      <Link
                        to={recordPath("vouchers", e.voucherCode) as never}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {e.voucherCode}
                      </Link>
                    </td>
                    <td className="font-mono text-xs">{e.account}</td>
                    <td>{e.narration}</td>
                    <td className="text-right">{e.debit ? npr(e.debit) : "—"}</td>
                    <td className="text-right">{e.credit ? npr(e.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2" colSpan={4}>Total</td>
                  <td className="text-right">{npr(debit)}</td>
                  <td className="text-right">{npr(credit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
