import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileDown, History, ShieldCheck, UserCog } from "lucide-react";
import { DataListPage, type Column } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { recordPath } from "@/features/registry/paths";
import { useAudit } from "@/services/entityService";
import type { AuditEvent } from "@/types/erp";

export const Route = createFileRoute("/_app/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — EcoWrap Nepal ERP" },
      { name: "description", content: "Non-erasable trail of every create, update, delete, approval and export in the ERP." },
      { property: "og:title", content: "Audit Logs — EcoWrap Nepal ERP" },
      { property: "og:description", content: "Non-erasable trail of every action recorded in the EcoWrap Nepal manufacturing ERP." },
    ],
  }),
  component: AuditLogsPage,
});

const tone = (a: string) =>
  a === "delete" || a === "rejected" || a === "reversed" || a === "reject" ? "danger"
    : a === "approve" || a === "approved" || a === "post" || a === "posted" ? "success"
    : a === "view" || a === "export" || a === "print" || a === "send" ? "neutral"
    : "info";

function fmt(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString();
}

function dump(value: unknown) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function AuditLogsPage() {
  const log = useAudit();
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const approvals = log.filter((e) => ["approve", "approved", "submit", "reject", "rejected", "return", "delegate"].includes(e.action)).length;
  const exports = log.filter((e) => e.action === "export" || e.action === "print" || e.action === "send").length;
  const views = log.filter((e) => e.action === "view").length;

  const columns: Array<Column<AuditEvent>> = [
    { key: "time", header: "Timestamp", cell: (e) => <span className="font-mono text-xs">{fmt(e.at)}</span>, value: (e) => e.at },
    {
      key: "user",
      header: "User",
      cell: (e) => (
        <div>
          <div className="font-medium">{e.user}</div>
          <div className="text-xs text-muted-foreground">{e.role}</div>
        </div>
      ),
      value: (e) => e.user,
    },
    { key: "action", header: "Action", cell: (e) => <StatusBadge tone={tone(e.action)}>{e.action}</StatusBadge>, value: (e) => e.action },
    { key: "module", header: "Module", cell: (e) => e.module, value: (e) => e.module },
    { key: "record", header: "Record", cell: (e) => e.recordCode ?? e.entity, value: (e) => e.recordCode ?? e.entity },
    { key: "reason", header: "Reason", cell: (e) => <span className="line-clamp-2 text-xs text-muted-foreground">{e.reason ?? "—"}</span>, value: (e) => e.reason ?? "" },
    { key: "ip", header: "IP address", cell: (e) => <span className="font-mono text-xs">{e.ip}</span>, value: (e) => e.ip },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Non-erasable record of create, view, edit, delete, approve, reject, submit, cancel, post, reverse, export, print and send."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Events" value={log.length} icon={History} />
        <KpiCard label="Workflow" value={approvals} icon={ShieldCheck} hint="Submit / approve / reject" />
        <KpiCard label="Views" value={views} icon={UserCog} accent="secondary" />
        <KpiCard label="Export / print" value={exports} icon={FileDown} accent="muted" />
      </div>

      <DataListPage
        rows={log}
        rowKey={(e) => e.id}
        columns={columns}
        exportName="audit-log"
        auditModule="system"
        auditEntity="audit-logs"
        searchPlaceholder="Search user, module, record, reason…"
        search={(e, q) => [e.user, e.module, e.entity, e.recordCode ?? "", e.ip, e.action, e.reason ?? ""].some((v) => v.toLowerCase().includes(q))}
        filters={[
          {
            key: "action",
            placeholder: "All actions",
            options: Array.from(new Set(log.map((e) => e.action))).sort().map((v) => ({ value: v, label: v })),
            match: (e, v) => e.action === v,
          },
          {
            key: "module",
            placeholder: "All modules",
            options: Array.from(new Set(log.map((e) => e.module))).sort().map((v) => ({ value: v, label: v })),
            match: (e, v) => e.module === v,
          },
        ]}
        onRowClick={setOpen}
        mobileCard={(e) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{e.user}</div>
                <div className="text-xs text-muted-foreground">
                  {e.role} · {e.module}
                </div>
              </div>
              <StatusBadge tone={tone(e.action)}>{e.action}</StatusBadge>
            </div>
            <div className="truncate text-sm">{e.recordCode ?? e.entity}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {fmt(e.at)} · {e.ip}
            </div>
          </div>
        )}
      />

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{open?.action} · {open?.recordCode ?? open?.entity}</DialogTitle>
            <DialogDescription>
              {open ? `${open.user} (${open.role}) · ${fmt(open.at)} · ${open.ip}` : ""}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              {open.reason && <p><span className="text-muted-foreground">Reason: </span>{open.reason}</p>}
              {open.recordCode && open.entity && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={recordPath(open.entity, open.recordCode) as never}>Open record</Link>
                </Button>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before</p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px]">{dump(open.before)}</pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">After</p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px]">{dump(open.after)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
