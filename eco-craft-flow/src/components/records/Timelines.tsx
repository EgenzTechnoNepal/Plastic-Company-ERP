import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { statusLabel, statusTone } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import type { StatusEvent } from "@/types/erp";

function fmt(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString();
}

export function WorkflowTimeline({ events }: { events: StatusEvent[] }) {
  if (!events.length) return null;
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((e) => (
          <div key={e.id} className="flex gap-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusBadge>
                <span className="text-xs text-muted-foreground">{e.by}</span>
              </div>
              {e.comment && <p className="mt-1 text-sm">{e.comment}</p>}
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{fmt(e.at)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AuditTimeline({
  events,
}: {
  events: Array<{ id: string; at: string; user: string; action: string; reason?: string }>;
}) {
  if (!events.length) {
    return (
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Audit</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No audit events on this record yet.</CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((e) => (
          <div key={e.id}>
            <div className="text-sm font-medium">
              {e.action} <span className="font-normal text-muted-foreground">by {e.user}</span>
            </div>
            {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
            <p className="font-mono text-[11px] text-muted-foreground">{fmt(e.at)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function RelatedRecords({
  links,
}: {
  links: Array<{ entity: string; id: string; label?: string }>;
}) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Related</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {links.length === 0 && <p className="text-sm text-muted-foreground">No linked documents.</p>}
        {links.map((l) => {
          const code = l.label ?? l.id.split(":").pop() ?? l.id;
          return (
            <Link
              key={l.id}
              to={recordPath(l.entity, code) as never}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="truncate">{l.label ?? l.id}</span>
              <span className="text-xs text-muted-foreground">{l.entity.replace(/_/g, " ")}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
