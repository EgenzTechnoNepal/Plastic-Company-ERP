import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { recordPath } from "@/features/registry/paths";
import { convertMrpRow, mrpRowsOf } from "@/features/production/cycle";
import { useRecord } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

export function MrpPanel({ run }: { run: ErpRecord }) {
  const navigate = useNavigate();
  const live = useRecord("mrp_runs", run.code) ?? run;
  const rows = mrpRowsOf(live);

  const convert = async (item: string) => {
    try {
      const next = await convertMrpRow(live, item);
      toast.success(`${item} converted to ${next.code}`);
      navigate({ to: recordPath(next.entity, next.code) as never });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Convert failed");
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Suggestions · gross → net → lot size</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Gross</th>
              <th className="py-2 text-right">On hand</th>
              <th className="py-2 text-right">Alloc.</th>
              <th className="py-2 text-right">Open PO</th>
              <th className="py-2 text-right">WIP</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2">Suggest</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item} className="border-b last:border-0">
                <td className="py-2">
                  <div className="font-medium">{r.item}</div>
                  <div className="text-xs text-muted-foreground">{r.itemType} · need {r.needBy}</div>
                </td>
                <td className="py-2 text-right tabular-nums">{r.gross.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right tabular-nums">{r.onHand.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right tabular-nums">{r.allocated.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right tabular-nums">{r.openPo.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right tabular-nums">{r.wip.toLocaleString("en-IN")}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-primary">{r.net.toLocaleString("en-IN")}</td>
                <td className="py-2">
                  <StatusBadge tone={r.converted ? "success" : r.net > 0 ? "warning" : "neutral"}>
                    {r.converted ? "Converted" : r.suggest}
                  </StatusBadge>
                </td>
                <td className="py-2 text-right">
                  {!r.converted && r.net > 0 && (
                    <PermissionGuard action="create">
                      <Button size="sm" variant="outline" onClick={() => convert(r.item)}>
                        Convert
                      </Button>
                    </PermissionGuard>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
