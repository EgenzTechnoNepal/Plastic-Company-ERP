import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileWarning, RefreshCw, Send } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { getService } from "@/services/catalog";
import { checkPanFormat, retryCbms } from "@/services/integrations/ird";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/ird")({ component: IrdPage });

function IrdPage() {
  const invoices = useRecords("invoices");
  const credits = useRecords("credit_notes");
  const submissions = useRecords("ird_submissions");
  const vat = useRecords("vat_registers");
  const [localRetry, setLocalRetry] = useState<string[]>([]);
  const [pan, setPan] = useState("601234567");
  const [panMsg, setPanMsg] = useState<string | null>(null);

  const queue = submissions.length
    ? submissions.map((s) => ({
        id: s.id,
        number: s.code,
        status: localRetry.includes(s.id) ? "queued" : s.status,
        pan: String(s.fields?.pan ?? s.fields?.buyerPan ?? "—"),
      }))
    : invoices.slice(0, 8).map((inv, i) => ({
        id: inv.id,
        number: inv.code,
        status: i % 5 === 0 ? "retry" : "queued",
        pan: String(inv.fields?.buyerPan ?? "601234567"),
      }));

  const retry = async (id: string) => {
    try {
      await getService("ird_submissions").update(id, { status: "submitted" });
      setLocalRetry((ids) => [...ids, id]);
    } catch {
      setLocalRetry((ids) => [...ids, id]);
    }
    await retryCbms(id).catch(() => undefined);
    toast.success("Queued for CBMS retry");
  };

  const salesVat = invoices.reduce((s, r) => s + num(r, "tax") + (recordTaxFallback(r)), 0);
  const purchaseBills = useRecords("purchase_bills");
  const purchaseVat = purchaseBills.reduce((s, r) => s + num(r, "tax"), 0);

  return (
    <div>
      <PageHeader
        title="IRD / CBMS"
        description="Tamper-evident invoice numbering, VAT registers, PAN format check. CBMS submit waits for Django."
      />
      <IntegrationGate provider="IRD CBMS">
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Invoices" value={invoices.length} icon={Send} />
          <KpiCard label="Credit notes" value={credits.length} icon={FileWarning} accent="secondary" />
          <KpiCard label="Queued" value={queue.filter((q) => q.status === "queued").length} accent="accent" />
          <KpiCard label="Retry" value={queue.filter((q) => q.status === "retry").length} icon={RefreshCw} accent="muted" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">CBMS submission queue</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {queue.length === 0 && <EmptyState title="Queue empty" description="Posted invoices appear here when CBMS is enabled." />}
              {queue.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{row.number}</p>
                    <p className="text-xs text-muted-foreground">Buyer PAN {row.pan}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={row.status === "retry" ? "warning" : "info"}>{row.status}</StatusBadge>
                    {(row.status === "retry" || row.status === "rejected") && (
                      <Button size="sm" variant="outline" onClick={() => retry(row.id)}>Retry</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">PAN check (local)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="pan">Buyer / vendor PAN</Label>
              <div className="flex gap-2">
                <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value)} />
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = checkPanFormat(pan);
                    setPanMsg(r.message);
                    toast.message(r.ok ? "Format OK" : "Format issue");
                  }}
                >
                  Check
                </Button>
              </div>
              {panMsg && <p className="text-sm text-muted-foreground">{panMsg}</p>}
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">VAT sales register (derived)</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="flex justify-between border-b py-2">
                <span>Taxable invoices</span>
                <span>{invoices.length}</span>
              </div>
              <div className="flex justify-between py-2 font-medium">
                <span>VAT (proxy)</span>
                <span>{npr(salesVat)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">VAT purchase register (derived)</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="flex justify-between border-b py-2">
                <span>Vendor bills</span>
                <span>{purchaseBills.length}</span>
              </div>
              <div className="flex justify-between py-2 font-medium">
                <span>VAT (proxy)</span>
                <span>{npr(purchaseVat)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        {vat.length > 0 && (
          <Card className="mt-6">
            <CardHeader><CardTitle className="text-base">VAT registers</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {vat.map((row) => (
                <div key={row.id} className="flex justify-between border-b py-2">
                  <span>{row.title || row.code}</span>
                  <span className="text-muted-foreground">{row.status} · {str(row, "period")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </IntegrationGate>
    </div>
  );
}

function recordTaxFallback(r: { lines: Array<{ taxPct?: number; qty: number; rate: number }>; fields: Record<string, unknown> }): number {
  if (typeof r.fields.tax === "number") return 0;
  return r.lines.reduce((s, l) => s + (l.qty * l.rate * (l.taxPct ?? 13)) / 100, 0);
}
