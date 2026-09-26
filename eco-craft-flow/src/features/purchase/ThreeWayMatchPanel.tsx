import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { MATCH_TOLERANCE_PCT, threeWayMatch } from "@/features/purchase/cycle";
import type { ErpRecord } from "@/types/erp";

export function ThreeWayMatchPanel({ bill }: { bill: ErpRecord }) {
  const match = threeWayMatch(bill);
  const landed = num(bill, "freight") + num(bill, "duty") + num(bill, "clearing");
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">3-way match · PO + GRN + bill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Client preview only — server <code className="text-[10px]">supplier-bills/&#123;id&#125;/match/</code> is authoritative.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={match.ok ? "success" : "danger"}>
            {match.ok ? "Preview matched" : "Preview exception"}
          </StatusBadge>
          <span className="text-xs text-muted-foreground">Tolerance ±{MATCH_TOLERANCE_PCT}% qty / value</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Bill qty / amount</p>
            <p className="font-semibold">{match.billQty.toLocaleString("en-IN")} · {npr(match.billAmt)}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">PO qty / amount</p>
            <p className="font-semibold">{match.poQty.toLocaleString("en-IN")} · {npr(match.poAmt)}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">GRN accepted</p>
            <p className="font-semibold">{match.grnQty.toLocaleString("en-IN")}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Landed cost (freight + duty + clearing): {npr(landed)}. PO {str(bill, "purchaseOrder") || "—"} · GRN {str(bill, "grn") || "—"}.
        </p>
        {!match.ok && <p className="text-xs text-destructive">{match.message}</p>}
      </CardContent>
    </Card>
  );
}
