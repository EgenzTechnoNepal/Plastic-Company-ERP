import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { str } from "@/lib/records";
import { CAPA_STAGES } from "@/features/quality/cycle";
import type { ErpRecord } from "@/types/erp";

export function CapaPipeline({ capa }: { capa: ErpRecord }) {
  const current = str(capa, "stage") || "Containment";
  const idx = CAPA_STAGES.indexOf(current as (typeof CAPA_STAGES)[number]);
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">CAPA stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CAPA_STAGES.map((s, i) => (
            <StatusBadge key={s} tone={i < idx ? "success" : i === idx ? "info" : "neutral"}>
              {s}
            </StatusBadge>
          ))}
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          {[
            ["Containment", str(capa, "containment")],
            ["Root cause", str(capa, "rootCause")],
            ["Corrective", str(capa, "correctiveAction")],
            ["Preventive", str(capa, "preventiveAction")],
            ["Effectiveness", str(capa, "effectiveness")],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p>{value || "—"}</p>
            </div>
          ))}
        </div>
        {str(capa, "evidence") ? <p className="text-xs text-muted-foreground">Evidence: {str(capa, "evidence")}</p> : null}
      </CardContent>
    </Card>
  );
}
