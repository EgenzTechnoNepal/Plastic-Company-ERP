import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Mail, Printer, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/EmptyState";
import { downloadDoc, downloadPdfHtml, downloadXls, rowsToHtmlTable } from "@/lib/export";
import { getField, str } from "@/lib/records";
import { ENTITIES } from "@/features/registry/entities";
import { getService } from "@/services/catalog";
import { sendReportEmail, useOutboundMail, RESEND_SETTINGS_SHAPE } from "@/services/integrations/resend";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/reports/builder")({ component: ReportBuilderPage });

function ReportBuilderPage() {
  const [entity, setEntity] = useState("invoices");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [to, setTo] = useState("accounts@ecowrap.com");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [schedule, setSchedule] = useState<"once" | "weekly">("once");
  const [viewName, setViewName] = useState("");
  const queue = useOutboundMail();
  const saved = useRecords("saved_reports");
  const rows = useRecords(entity);
  const def = ENTITIES.find((e) => e.key === entity);
  const columns = def?.columns ?? [];

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const table = useMemo(() => {
    const base = filtered.map((r) => {
      const out: Record<string, string | number> = { Code: r.code, Title: r.title, Status: r.status };
      for (const c of columns) {
        if (c.key === "code" || c.key === "title" || c.key === "status") continue;
        out[c.label] = String(getField(r, c.key) ?? "");
      }
      return out;
    });
    if (!groupBy) return base;
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = str(r, groupBy) || r.status || "(blank)";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([Group, Count]) => ({ Group, Count }));
  }, [filtered, columns, groupBy]);

  const htmlBody = () =>
    `<p>EcoWrap report: ${def?.label ?? entity}</p>${rowsToHtmlTable(table)}<p>${filtered.length} rows · generated locally</p>`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report builder</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="entity">Source entity</Label>
            <select
              id="entity"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            >
              {ENTITIES.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status filter</Label>
            <select
              id="status"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              {(def?.statuses ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group">Group by field</Label>
            <select
              id="group"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="">None (detail rows)</option>
              <option value="status">status</option>
              {(def?.fields ?? []).slice(0, 12).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
            <Button size="sm" onClick={() => downloadXls(`${entity}-report`, table)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadPdfHtml(`${def?.label ?? entity} report`, htmlBody())}
            >
              <Printer className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadDoc(`${entity}-report`, def?.label ?? entity, htmlBody())}
            >
              <FileText className="mr-1 h-4 w-4" /> Word
            </Button>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <Input
                placeholder="Saved view name"
                className="max-w-xs"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={async () => {
                  if (!viewName.trim()) {
                    toast.error("Name the view");
                    return;
                  }
                  await getService("saved_reports").create({
                    title: viewName.trim(),
                    status: "completed",
                    fields: {
                      entity,
                      statusFilter,
                      groupBy,
                      body: `Saved view · ${filtered.length} rows`,
                    },
                  });
                  toast.success("View saved");
                  setViewName("");
                }}
              >
                <Save className="h-4 w-4" /> Save view
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send via Resend-shaped queue</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc">Cc</Label>
            <Input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject || `${def?.label ?? entity} report`}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched">Schedule</Label>
            <select
              id="sched"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as "once" | "weekly")}
            >
              <option value="once">Once</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              size="sm"
              className="gap-1"
              onClick={() =>
                void sendReportEmail({
                  from: RESEND_SETTINGS_SHAPE.from,
                  to: to.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                  cc: cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                  subject: subject || `${def?.label ?? entity} report`,
                  html: htmlBody(),
                  schedule,
                  attachments: [{ filename: `${entity}.xls`, contentType: "application/vnd.ms-excel" }],
                })
              }
            >
              <Mail className="h-4 w-4" /> Queue email
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/integrations/email">Open email console</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Never calls Resend from the browser. Django later: POST /api/v1/integrations/email/send/ with RESEND_API_KEY.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Preview · {filtered.length} rows</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {table.length === 0 ? (
              <EmptyState title="No rows" description="Adjust filters or pick another entity." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {Object.keys(table[0]).map((h) => (
                      <th key={h} className="py-2 pr-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.slice(0, 40).map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(r).map((v, j) => (
                        <td key={j} className="py-2 pr-3">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Queue & saved views</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs font-medium uppercase text-muted-foreground">Outbound mail</p>
            {queue.length === 0 && <p className="text-muted-foreground">Empty</p>}
            {queue.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded border p-2">
                <p className="font-medium">{m.subject}</p>
                <p className="text-xs text-muted-foreground">{m.status} · {m.to.join(", ")}</p>
              </div>
            ))}
            <p className="pt-2 text-xs font-medium uppercase text-muted-foreground">Saved reports</p>
            {saved.slice(0, 5).map((r) => (
              <div key={r.id} className="rounded border p-2">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{str(r, "entity") || r.code}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
