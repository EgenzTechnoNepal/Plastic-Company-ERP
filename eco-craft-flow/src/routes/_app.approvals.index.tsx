import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Forward, RotateCcw, ShieldAlert, UserPlus } from "lucide-react";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PermissionGuard } from "@/lib/permissions";
import { npr } from "@/lib/export";
import { recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { canDecide, isEscalated } from "@/features/workflow/approvals";
import { getService } from "@/services/catalog";
import { useApprovalRules, useApprovals } from "@/services/entityService";
import { DEMO_ACCOUNTS, useAuthStore } from "@/store/auth";
import type { ApprovalRequest } from "@/types/erp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/approvals/")({
  component: ApprovalInboxPage,
});

type FilterKey = "mine" | "pending" | "escalated" | "decided";
type Decision = "reject" | "return" | "delegate";

function tone(status: ApprovalRequest["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "returned") return "warning" as const;
  return "warning" as const;
}

function ApprovalInboxPage() {
  const user = useAuthStore((s) => s.user);
  const rows = useApprovals();
  const rules = useApprovalRules();
  const [filter, setFilter] = useState<FilterKey>("mine");
  const [confirm, setConfirm] = useState<{ action: Decision; row: ApprovalRequest } | null>(null);
  const [delegateTo, setDelegateTo] = useState("");

  const mine = rows.filter((r) => canDecide(r, user));
  const pending = rows.filter((r) => r.status === "pending");
  const escalated = pending.filter((r) => isEscalated(r, rules));
  const decided = rows.filter((r) => r.status !== "pending");

  const visible = useMemo(() => {
    if (filter === "mine") return mine;
    if (filter === "pending") return pending;
    if (filter === "escalated") return escalated;
    return decided;
  }, [filter, mine, pending, escalated, decided]);

  const run = async (row: ApprovalRequest, action: "approve" | Decision, reason?: string) => {
    const svc = getService(row.entity);
    try {
      if (action === "approve") await svc.approve(row.recordId);
      if (action === "reject") await svc.reject(row.recordId, reason ?? "Rejected");
      if (action === "return") await svc.returnToSender(row.recordId, reason ?? "Returned");
      if (action === "delegate") await svc.delegate(row.recordId, delegateTo || "", reason);
      const done = { approve: "approved", reject: "rejected", return: "returned", delegate: "delegated" } as const;
      toast.success(`${row.recordCode} ${done[action]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const others = DEMO_ACCOUNTS.filter((u) => u.name !== user?.name);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Waiting on you" value={mine.length} icon={Clock} hint="Pending + delegated" />
        <KpiCard label="Escalated" value={escalated.length} icon={ShieldAlert} accent="secondary" hint="Past escalation hours" />
        <KpiCard label="All pending" value={pending.length} icon={Forward} accent="accent" />
        <KpiCard label="Decided" value={decided.length} icon={Check} accent="muted" />
      </div>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
          {(["mine", "pending", "escalated", "decided"] as FilterKey[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f === "mine" ? "My queue" : f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing in this queue" description="Submit a quotation, leave request or stock adjustment to generate an approval." />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const def = getEntity(row.entity);
            const late = isEscalated(row, rules);
            const href = recordPath(row.entity, row.recordCode);
            const canAct = canDecide(row, user) && row.status === "pending";
            return (
              <Card key={row.id} className={cn("rounded-2xl border-border/60", late && row.status === "pending" && "border-destructive/40")}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={href as never} className="font-mono text-sm font-semibold text-primary hover:underline">
                        {row.recordCode}
                      </Link>
                      <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                      {late && row.status === "pending" && <StatusBadge tone="danger">escalated</StatusBadge>}
                    </div>
                    <p className="mt-1 text-sm">
                      {row.documentType} · {row.department} · {npr(row.amount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.requester} · level {row.level}/{row.totalLevels} · {row.mode ?? "sequential"} · {row.approverRole}
                      {row.delegatedTo ? ` · delegated to ${row.delegatedTo}` : ""} · due {row.dueDate}
                    </p>
                    {row.reason && <p className="mt-1 text-xs">{row.reason}</p>}
                  </div>
                  {canAct && (
                    <PermissionGuard action="approve" module={def?.module}>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => run(row, "approve")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ action: "reject", row })}>
                          Reject
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setConfirm({ action: "return", row })}>
                          <RotateCcw className="h-3.5 w-3.5" /> Return
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setDelegateTo(others[0]?.name ?? ""); setConfirm({ action: "delegate", row }); }}>
                          <UserPlus className="h-3.5 w-3.5" /> Delegate
                        </Button>
                      </div>
                    </PermissionGuard>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null && confirm.action !== "delegate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "reject" ? "Reject document" : "Return for information"}
        description="The requester is notified. A reason is required."
        requireReason
        confirmLabel={confirm?.action === "reject" ? "Reject" : "Return"}
        tone="destructive"
        onConfirm={async (reason) => {
          if (confirm) await run(confirm.row, confirm.action, reason);
        }}
      />

      <Dialog open={confirm?.action === "delegate"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate this approval</DialogTitle>
            <DialogDescription>The document stays pending. The delegate can approve, reject or return.</DialogDescription>
          </DialogHeader>
          <Select value={delegateTo} onValueChange={setDelegateTo}>
            <SelectTrigger>
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {others.map((u) => (
                <SelectItem key={u.id} value={u.name}>
                  {u.name} · {u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={!delegateTo}
              onClick={async () => {
                if (confirm) await run(confirm.row, "delegate");
                setConfirm(null);
              }}
            >
              Delegate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
