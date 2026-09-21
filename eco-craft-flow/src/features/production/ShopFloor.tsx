import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { npr } from "@/lib/export";
import { num, statusLabel, statusTone, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import {
  completeOperation,
  pauseOperation,
  startOperation,
  woCosting,
} from "@/features/production/cycle";
import { useRecord, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

export function ShopFloor({ wo }: { wo: ErpRecord }) {
  const live = useRecord("work_orders", wo.code) ?? wo;
  const ops = useRecords("operations").filter((o) => str(o, "workOrder") === live.code);
  const issues = useRecords("material_issues").filter((m) => str(m, "workOrder") === live.code);
  const cost = woCosting(live);

  const run = async (fn: () => Promise<ErpRecord>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shop floor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Planned</p>
              <p className="text-lg font-semibold">{num(live, "plannedQty").toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Produced</p>
              <p className="text-lg font-semibold">{num(live, "producedQty").toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Scrap</p>
              <p className="text-lg font-semibold">{num(live, "scrapQty").toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Variance</p>
              <p className="text-lg font-semibold">{npr(cost.variance)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operations</p>
            {ops.length === 0 && <p className="text-sm text-muted-foreground">No operations yet. Start extrusion from the header.</p>}
            {ops.map((op) => (
              <div key={op.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <Link to={recordPath("operations", op.code) as never} className="min-w-0 hover:text-primary">
                  <span className="font-mono text-xs">{op.code}</span>
                  <span className="ml-2">{str(op, "workCentre")}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{str(op, "operator") || str(op, "machine")}</span>
                </Link>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={statusTone(op.status)}>{statusLabel(op.status)}</StatusBadge>
                  <PermissionGuard action="edit">
                    {op.status === "in_progress" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => run(() => pauseOperation(op, "Breakdown"), "Paused")}>
                          Pause
                        </Button>
                        <Button size="sm" onClick={() => run(() => completeOperation(op), "Completed")}>
                          Complete
                        </Button>
                      </>
                    )}
                    {(op.status === "draft" || op.status === "hold") && (
                      <Button size="sm" onClick={() => run(() => startOperation(live, str(op, "workCentre") || "Extrusion"), op.status === "hold" ? "Resumed" : "Started")}>
                        {op.status === "hold" ? "Resume" : "Start"}
                      </Button>
                    )}
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Material issues</p>
            {issues.length === 0 && <p className="text-sm text-muted-foreground">Nothing issued. Use Issue material or Backflush.</p>}
            {issues.map((mi) => (
              <Link
                key={mi.id}
                to={recordPath("material_issues", mi.code) as never}
                className="mb-2 flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>{mi.code} · {str(mi, "mode")} · {mi.lines.length} lines</span>
                <StatusBadge tone={statusTone(mi.status)}>{statusLabel(mi.status)}</StatusBadge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
