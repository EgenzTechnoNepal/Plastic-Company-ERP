import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { str } from "@/lib/records";
import { specOf } from "@/features/quality/cycle";
import type { ErpRecord } from "@/types/erp";

export function PlanSpec({ plan }: { plan: ErpRecord }) {
  const spec = specOf(plan);
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Spec master · {str(plan, "sampleSize") || "sampling"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {str(plan, "product")} · {str(plan, "stage")} · used when recording incoming, in-process and final inspections.
        </p>
        {spec.length === 0 && <p className="text-sm text-muted-foreground">Add parameters on the plan to drive the inspection grid.</p>}
        <ul className="space-y-1 text-sm">
          {spec.map((s) => (
            <li key={s.parameter} className="flex justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="font-medium">{s.parameter}</span>
              <span className="text-muted-foreground">{s.expected}{s.instrument ? ` · ${s.instrument}` : ""}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
