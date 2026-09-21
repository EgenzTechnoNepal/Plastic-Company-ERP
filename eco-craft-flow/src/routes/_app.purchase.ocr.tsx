import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Percent, ScanLine, ShieldAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { npr } from "@/lib/export";
import { num, str, sumField } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/purchase/ocr")({
  component: OcrBillsPage,
});

function OcrBillsPage() {
  const rows = useRecords("ocr_bills");
  const exceptions = rows.filter((r) => ["Mismatch", "Exception"].includes(str(r, "matchStatus")));

  return (
    <div className="space-y-6">
      <IntegrationGate provider="Cloud OCR / IRD bill engine">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capture channels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">QR scan / paste</strong> — fills bill fields in-browser (allowed now).
              </p>
              <p>
                <strong className="text-foreground">Image upload</strong> — stored on the local scan record only.
              </p>
              <p>
                <strong className="text-foreground">Cloud OCR</strong> — stubbed until Django + vendor credentials.
              </p>
              <p>Open a scan and use the reviewer panel to correct fields before converting to a vendor bill.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exception queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptions.length === 0 && (
                <p className="text-sm text-muted-foreground">No match exceptions right now.</p>
              )}
              {exceptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div>
                    <p className="font-medium">{r.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {str(r, "vendor")} · {str(r, "matchStatus")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={recordPath("ocr_bills", r.code) as never}>Review</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </IntegrationGate>
      <EntityListPage
        entity="ocr_bills"
        extraFilters={[
          {
            key: "matchStatus",
            placeholder: "All matches",
            options: ["Pending", "Matched", "Mismatch", "Exception"].map((v) => ({ value: v, label: v })),
            match: (row, value) => str(row, "matchStatus") === value,
          },
        ]}
        kpis={(list) => [
          { label: "Scanned Bills", value: list.length, icon: ScanLine },
          { label: "Extracted Total", value: npr(sumField(list, "extractedTotal")), icon: CheckCircle2 },
          {
            label: "Avg Confidence",
            value: list.length
              ? `${Math.round((list.reduce((s, r) => s + num(r, "confidence"), 0) / list.length) * 100)}%`
              : "—",
            icon: Percent,
            accent: "secondary",
          },
          {
            label: "Exceptions",
            value: list.filter((r) => ["Mismatch", "Exception"].includes(str(r, "matchStatus"))).length,
            icon: ShieldAlert,
            accent: "muted",
          },
        ]}
      />
    </div>
  );
}
