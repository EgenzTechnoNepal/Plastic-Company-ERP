import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { woCosting } from "@/features/production/cycle";
import type { ErpRecord } from "@/types/erp";

export function CostingPanel({ wo }: { wo: ErpRecord }) {
  const cost = woCosting(wo);
  const closed = wo.status === "closed";
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cost variance</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Standard ({num(wo, "producedQty") || num(wo, "plannedQty")} × {npr(cost.standardUnit)})</p>
          <p className="text-lg font-semibold">{npr(cost.standard)}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Material</p>
          <p className="text-lg font-semibold">{npr(cost.material)}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Labour</p>
          <p className="text-lg font-semibold">{npr(cost.labour)}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{closed ? "Closed variance" : "Projected variance"}</p>
          <p className={`text-lg font-semibold ${cost.variance > 0 ? "text-destructive" : "text-primary"}`}>{npr(cost.variance)}</p>
          {str(wo, "batch") ? <p className="text-xs text-muted-foreground">{str(wo, "batch")}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
