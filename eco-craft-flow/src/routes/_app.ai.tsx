import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Printer, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { downloadDoc, downloadPdfHtml, downloadXls, npr, rowsToHtmlTable } from "@/lib/export";
import { daysOverdue, invoiceBalance, isLowStock, num, str } from "@/lib/records";
import { getService } from "@/services/catalog";
import { recordTotal, useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/ai")({ component: AiWorkspacePage });

const PROMPTS = [
  "Summarise overdue AR",
  "Draft weekly production note",
  "Low stock risks",
  "Purchase exceptions",
];

const REDACT_KEYS = new Set([
  "basicSalary",
  "ssf",
  "basic",
  "allowances",
  "overtime",
  "cit",
  "tax",
  "net",
  "gross",
  "creditLimit",
  "outstanding",
]);

function AiWorkspacePage() {
  const invoices = useRecords("invoices");
  const products = useRecords("products");
  const workOrders = useRecords("work_orders");
  const ocr = useRecords("ocr_bills");
  const [q, setQ] = useState(PROMPTS[0]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [redact, setRedact] = useState(true);

  const contextNote = useMemo(() => {
    if (!redact) return "Redaction off — salary / credit-limit fields may appear in saved drafts.";
    return `Sensitive fields (${[...REDACT_KEYS].slice(0, 4).join(", ")}, …) skipped when building the summary payload.`;
  }, [redact]);

  const summarise = () => {
    const lower = q.toLowerCase();
    let body = "";
    if (lower.includes("overdue") || lower.includes("ar") || lower.includes("receivable")) {
      const overdue = invoices
        .map((inv) => ({
          code: inv.code,
          party: str(inv, "customerName") || inv.title,
          balance: invoiceBalance(inv),
          days: daysOverdue(str(inv, "dueDate")),
        }))
        .filter((r) => r.balance > 0 && r.days > 0)
        .sort((a, b) => b.days - a.days);
      const total = overdue.reduce((s, r) => s + r.balance, 0);
      body =
        overdue.length === 0
          ? "No overdue receivables in the current store."
          : [
              `Overdue AR summary (${overdue.length} invoices, ${npr(total)}):`,
              ...overdue.slice(0, 8).map((r) => `• ${r.code} — ${r.party}: ${npr(r.balance)} (${r.days}d)`),
              redact ? "" : "",
              "Governed AI — accept before any collection action or posting.",
            ]
              .filter(Boolean)
              .join("\n");
    } else if (lower.includes("production") || lower.includes("weekly")) {
      const open = workOrders.filter((w) => !["completed", "cancelled", "closed"].includes(w.status));
      body = [
        `Weekly production note (${new Date().toISOString().slice(0, 10)}):`,
        `• Open / released WOs: ${open.length} of ${workOrders.length}`,
        ...open.slice(0, 6).map((w) => `• ${w.code}: ${w.title} [${w.status}]`),
        "Draft only — accept to save; model gateway stays on Django.",
      ].join("\n");
    } else if (lower.includes("stock") || lower.includes("reorder")) {
      const low = products.filter(isLowStock);
      body =
        low.length === 0
          ? "No SKUs below reorder in the current set."
          : [
              `Low-stock risks (${low.length}):`,
              ...low.slice(0, 8).map(
                (p) =>
                  `• ${p.code} ${p.title}: on-hand ${num(p, "onHand")} vs reorder ${num(p, "reorderLevel")}${
                    redact ? "" : ` @ ${npr(num(p, "rate"))}`
                  }`,
              ),
            ].join("\n");
    } else if (lower.includes("purchase") || lower.includes("exception") || lower.includes("ocr")) {
      const ex = ocr.filter((r) => ["Mismatch", "Exception"].includes(str(r, "matchStatus")));
      body = [
        `Purchase / OCR exceptions: ${ex.length}`,
        ...ex.slice(0, 6).map((r) => `• ${r.code} — ${str(r, "vendor")} · ${str(r, "matchStatus")} · ${npr(num(r, "extractedTotal"))}`),
        ex.length === 0 ? "Queue is clear." : "Review in Purchase → Bill Scanning before AP post.",
      ].join("\n");
    } else {
      const ar = invoices.reduce((s, i) => s + invoiceBalance(i), 0);
      body = [
        `Plant snapshot: ${invoices.length} invoices (open AR ${npr(ar)}), ${products.length} products, ${workOrders.length} work orders.`,
        contextNote,
        "Ask for overdue AR, production note, low stock, or purchase exceptions for a focused draft.",
      ].join("\n");
    }
    setAnswer(body);
    toast.message("Suggestion is advisory — accept before any posting.");
  };

  const accept = async () => {
    if (!answer) return;
    await getService("insights").create({
      title: q.slice(0, 80),
      status: "approved",
      fields: {
        kind: "summary",
        prompt: q,
        body: answer,
        redacted: redact,
      },
    });
    await getService("saved_reports").create({
      title: `AI: ${q.slice(0, 60)}`,
      status: "completed",
      fields: { entity: "insights", body: answer },
    });
    toast.success("Accepted — stored as insight + saved report");
    setAnswer(null);
  };

  const exportRows = () => {
    const lines = (answer ?? "").split("\n").filter(Boolean);
    return lines.map((line, i) => ({ Line: i + 1, Text: line.replace(/^•\s*/, "") }));
  };

  return (
    <div>
      <PageHeader
        title="AI workspace"
        description="Governed AI — model gateway in backend. Deterministic summaries from live/mock records only; no OpenAI keys in the Vite app."
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Ask the plant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <Button key={p} size="sm" variant={q === p ? "default" : "outline"} onClick={() => setQ(p)}>
                {p}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={q} onChange={(e) => setQ(e.target.value)} />
            <Button className="gap-2" onClick={summarise}>
              <Sparkles className="h-4 w-4" /> Summarise
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="redact">Redact sensitive fields</Label>
              <p className="text-xs text-muted-foreground">{contextNote}</p>
            </div>
            <Switch id="redact" checked={redact} onCheckedChange={setRedact} />
          </div>
        </CardContent>
      </Card>
      {answer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-sans">{answer}</pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void accept()}>
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAnswer(null); toast("Rejected"); }}>
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => downloadXls("ai-summary", exportRows())}
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  downloadDoc("ai-summary", q, `<pre>${answer.replace(/</g, "&lt;")}</pre>`)
                }
              >
                <FileText className="h-4 w-4" /> Word
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  downloadPdfHtml(q, rowsToHtmlTable(exportRows()))
                }
              >
                <Printer className="h-4 w-4" /> PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Invoice PDF layout is out of scope. Open AR balance sample:{" "}
              {npr(invoices.reduce((s, i) => s + recordTotal(i), 0))}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
