import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PermissionGuard } from "@/lib/permissions";
import { npr } from "@/lib/export";
import { str } from "@/lib/records";
import { convertRfqToPo, quotesOf, selectVendor, type VendorQuote } from "@/features/purchase/cycle";
import { recordPath } from "@/features/registry/paths";
import { useRecord } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

export function RfqCompare({ rfq }: { rfq: ErpRecord }) {
  const navigate = useNavigate();
  const live = useRecord("rfqs", rfq.code) ?? rfq;
  const quotes = quotesOf(live);
  const selected = str(live, "selectedVendor");
  const [pick, setPick] = useState<VendorQuote | null>(null);

  const cheapest = quotes.reduce<VendorQuote | null>((m, q) => (!m || q.total < m.total ? q : m), null);
  const fastest = quotes.reduce<VendorQuote | null>((m, q) => (!m || q.leadDays < m.leadDays ? q : m), null);

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Vendor comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Price, lead time, terms and quality rating. Selection is recorded with a justification.
          {str(live, "selectionJustification") ? ` Current reason: ${str(live, "selectionJustification")}` : ""}
        </p>
        {quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet. Convert an approved PR to seed three vendor quotes.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Rate</th>
                <th className="py-2 pr-3">Lead (days)</th>
                <th className="py-2 pr-3">Terms</th>
                <th className="py-2 pr-3">Quality</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.vendor} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {q.vendor} <span className="ml-1 font-sans text-foreground">{q.vendorName}</span>
                    {cheapest?.vendor === q.vendor && <StatusBadge tone="success">lowest</StatusBadge>}
                    {fastest?.vendor === q.vendor && cheapest?.vendor !== q.vendor && <StatusBadge tone="info">fastest</StatusBadge>}
                    {selected === q.vendor && <StatusBadge tone="success">selected</StatusBadge>}
                  </td>
                  <td className="py-2 pr-3">{npr(q.rate)}</td>
                  <td className="py-2 pr-3">{q.leadDays}</td>
                  <td className="py-2 pr-3">{q.paymentTerms}</td>
                  <td className="py-2 pr-3">{q.qualityRating || "—"}</td>
                  <td className="py-2 pr-3 font-medium">{npr(q.total)}</td>
                  <td className="py-2 text-right">
                    <PermissionGuard action="edit" module="purchase">
                      <Button size="sm" variant={selected === q.vendor ? "secondary" : "outline"} onClick={() => setPick(q)}>
                        Select
                      </Button>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && live.status !== "completed" && (
          <PermissionGuard action="create" module="purchase">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const po = await convertRfqToPo(live);
                  toast.success(`${po.code} drafted`);
                  navigate({ to: recordPath(po.entity, po.code) as never });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "PO failed");
                }
              }}
            >
              Create PO from {selected}
            </Button>
          </PermissionGuard>
        )}
        <ConfirmDialog
          open={pick !== null}
          onOpenChange={(o) => !o && setPick(null)}
          title={`Select ${pick?.vendor ?? ""}`}
          description="Record why this vendor wins (price, lead time, quality rating, or terms)."
          requireReason
          reasonLabel="Selection justification"
          confirmLabel="Select vendor"
          onConfirm={async (reason) => {
            if (!pick) return;
            await selectVendor(live, pick.vendor, reason ?? "");
            toast.success(`${pick.vendor} selected`);
          }}
        />
      </CardContent>
    </Card>
  );
}
