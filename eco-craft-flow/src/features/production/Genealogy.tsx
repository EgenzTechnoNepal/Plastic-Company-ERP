import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { str } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

export function BatchGenealogy({ batch }: { batch: ErpRecord }) {
  const parents = (batch.links ?? []).filter((l) => l.entity !== "batches" || l.id !== batch.id);
  const wo = str(batch, "workOrder") || str(batch, "wo");
  const bom = str(batch, "bom");
  const rm = str(batch, "rmBatch") || str(batch, "sourceBatch");

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Genealogy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Finished batch" value={batch.code} />
        <Row label="Work order" value={wo || "—"} />
        <Row label="BOM" value={bom || "—"} />
        <Row label="Source / RM lot" value={rm || "—"} />
        {parents.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase text-muted-foreground">Linked documents</p>
            <ul className="list-disc pl-5">
              {parents.map((l) => (
                <li key={`${l.entity}-${l.id}`}>
                  {l.label ?? l.id} <span className="text-muted-foreground">({l.entity})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
