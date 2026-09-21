import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { planShortage } from "@/features/production/cycle";
import type { ErpRecord } from "@/types/erp";

export function PlanPanel({ plan }: { plan: ErpRecord }) {
  const rows = planShortage(plan);
  const short = rows.filter((r) => r.shortage > 0).length;
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          MPS shortage · {str(plan, "strategy")} · {str(plan, "version")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Planned vs available (on hand − reserved). {short} item{short === 1 ? "" : "s"} short of the plan.
          {str(plan, "previousVersion") ? ` Re-plan of ${str(plan, "previousVersion")}.` : ""}
          {str(plan, "replanReason") ? ` ${str(plan, "replanReason")}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Planned</th>
                <th className="py-2 text-right">Available</th>
                <th className="py-2 text-right">Shortage</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item} className="border-b last:border-0">
                  <td className="py-2">
                    <Link to={recordPath("products", r.item) as never} className="font-medium hover:text-primary">
                      {r.item}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.planned.toLocaleString("en-IN")}</td>
                  <td className="py-2 text-right tabular-nums">{r.available.toLocaleString("en-IN")}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-primary">{r.shortage.toLocaleString("en-IN")}</td>
                  <td className="py-2">
                    <StatusBadge tone={r.shortage > 0 ? "warning" : "success"}>
                      {r.shortage > 0 ? "Make / buy" : "Covered"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
