import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { checksOf, planForInspection } from "@/features/quality/cycle";
import { str } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

export function InspectionChecks({ qc }: { qc: ErpRecord }) {
  const checks = checksOf(qc);
  const plan = planForInspection(qc);
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Expected vs observed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Sampling {str(qc, "sampleSize") || "—"} · plan {plan ? plan.code : "none"} · ISO 17088
        </p>
        {checks.length === 0 && <p className="text-sm text-muted-foreground">No checks yet. Complete the inspection to fill the grid from the quality plan.</p>}
        {checks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Parameter</th>
                  <th className="py-2">Expected</th>
                  <th className="py-2">Observed</th>
                  <th className="py-2">Instrument</th>
                  <th className="py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.parameter} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.parameter}</td>
                    <td className="py-2 text-muted-foreground">{c.expected}</td>
                    <td className="py-2">{c.observed || "—"}</td>
                    <td className="py-2 text-xs">{c.instrument || "—"}</td>
                    <td className="py-2">
                      <StatusBadge tone={c.result === "Pass" ? "success" : c.result === "Fail" ? "danger" : "neutral"}>
                        {c.result || "Pending"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
