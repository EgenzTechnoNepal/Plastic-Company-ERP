import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supplierQuality } from "@/features/quality/cycle";
import type { ErpRecord } from "@/types/erp";

export function SupplierScorecard({ supplier }: { supplier: ErpRecord }) {
  const q = supplierQuality(supplier);
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Supplier quality rating</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Incoming inspections plus purchase returns. Score starts at pass rate and subtracts 8 points per return.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-lg font-semibold">{q.score}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Incoming</p>
            <p className="text-lg font-semibold">{q.incoming}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Passed</p>
            <p className="text-lg font-semibold">{q.passed}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold">{q.failed}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Returns</p>
            <p className="text-lg font-semibold">{q.returns}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
