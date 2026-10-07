import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, Forward, RotateCcw, Search, ShieldAlert, UserPlus } from "lucide-react";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGuard } from "@/lib/permissions";
import { npr } from "@/lib/export";
import { recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { canDecide, isEscalated } from "@/features/workflow/approvals";
import { getService } from "@/services/catalog";
import { decideApproval, TYPED_TARGET_ENTITY, useApprovalRules, useApprovals, useApprovalsStatus } from "@/services/entityService";
import { decideTypedApproval, getTypedApproval, listTypedApprovals, type ApprovalDto } from "@/services/api/crm";
import { ApiError } from "@/services/api/client";
import { invalidateLive } from "@/services/queryClient";
import { DEMO_ACCOUNTS, useAuthStore } from "@/store/auth";
import type { ApprovalRequest } from "@/types/erp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/approvals/")({
  component: ApprovalInboxPage,
});

type FilterKey = "mine" | "pending" | "escalated" | "decided";
type Decision = "reject" | "return" | "delegate" | "cancel";

function tone(status: ApprovalRequest["status"]) {
  if (status === "draft") return "neutral" as const;
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "cancelled") return "neutral" as const;
  return "warning" as const;
}

function ApprovalInboxPage() {
  const live = useAuthStore((s) => s.source === "api");
  return live ? <LiveApprovalInboxPage /> : <LegacyApprovalInboxPage />;
}

type LiveStatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "DRAFT" | "ALL";

function approvalErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Approval request failed.";
  }
  const details = Object.entries(error.fields).flatMap(([field, value]) => {
    const messages = Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
    return messages.map((message) => `${field}: ${message}`);
  });
  return [...new Set([error.message, ...details])].filter(Boolean).join(" · ");
}

function liveStatusTone(status: ApprovalDto["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REJECTED") return "danger" as const;
  if (status === "CANCELLED") return "neutral" as const;
  return "warning" as const;
}

function LiveApprovalInboxPage() {
  const [statusFilter, setStatusFilter] = useState<LiveStatusFilter>("PENDING");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalDto | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const normalizedSearch = search.trim();
  const approvals = useQuery({
    queryKey: ["typed-approvals", { status: statusFilter, search: normalizedSearch }],
    queryFn: () => listTypedApprovals({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      search: normalizedSearch || undefined,
    }),
    staleTime: 10_000,
    retry: 1,
  });
  const detail = useQuery({
    queryKey: ["typed-approval", detailId],
    queryFn: () => getTypedApproval(detailId!),
    enabled: Boolean(detailId),
    retry: 1,
  });
  const rows = approvals.data ?? [];

  const runDecision = async (row: ApprovalDto, decision: "approve" | "reject", actionReason = "") => {
    setBusyId(row.id);
    setActionError(null);
    try {
      await decideTypedApproval(row.id, decision, actionReason);
      const label = row.document_number || row.id;
      toast.success(`${label} ${decision === "approve" ? "approved" : "rejected"}`);
      invalidateLive(["typed-approvals"], ["typed-approval", row.id], ["audit-logs"], ["dashboard-summary"]);
      const entity = TYPED_TARGET_ENTITY[row.target_type];
      if (entity) {
        invalidateLive(["record", entity, row.target_id], ["records", entity]);
      }
      setRejectTarget(null);
      setReason("");
    } catch (error) {
      const message = approvalErrorMessage(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search document number or title"
            aria-label="Search approvals"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LiveStatusFilter)}>
            <SelectTrigger className="w-44" aria-label="Filter approvals by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ALL">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void approvals.refetch()}
            disabled={approvals.isFetching}
          >
            {approvals.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      {approvals.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>Could not load approval requests: {approvalErrorMessage(approvals.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void approvals.refetch()}>Retry</Button>
        </div>
      ) : approvals.isLoading ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading approval requests…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={normalizedSearch ? "No matching approvals" : "No approval requests"}
          description={normalizedSearch ? "Try a different document number or title." : "The backend returned no requests for this status."}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const entity = TYPED_TARGET_ENTITY[row.target_type];
            const href = entity ? recordPath(entity, row.target_id) : undefined;
            const pending = row.status === "PENDING";
            return (
              <Card key={row.id} className="rounded-2xl border-border/60">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {href ? (
                        <Link to={href as never} className="font-mono text-sm font-semibold text-primary hover:underline">
                          {row.document_number || row.target_id}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-semibold">
                          {row.document_number || row.target_id}
                        </span>
                      )}
                      <StatusBadge tone={liveStatusTone(row.status)}>{row.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm">{row.title || row.target_type}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.target_type} · {row.module_code} · Requested by {row.requested_by_email || row.requested_by || "—"} · {row.requested_at.slice(0, 10)}
                    </p>
                    {row.comments && <p className="mt-2 text-sm">{row.comments}</p>}
                    {row.decision_reason && (
                      <p className="mt-1 text-xs text-muted-foreground">Decision reason: {row.decision_reason}</p>
                    )}
                    {busyId === row.id && <p role="status" className="mt-2 text-xs text-muted-foreground">Submitting decision…</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                      Details
                    </Button>
                    {pending && (
                      <>
                        <Button size="sm" onClick={() => void runDecision(row, "approve")} disabled={busyId === row.id}>
                          {busyId === row.id ? "Submitting…" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRejectTarget(row); setActionError(null); }}
                          disabled={busyId === row.id}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approval details</DialogTitle>
            <DialogDescription>Current approval data retrieved from the backend.</DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Loading approval details…</p>
          ) : detail.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{approvalErrorMessage(detail.error)}</p>
              <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>Retry</Button>
            </div>
          ) : detail.data ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Document</dt><dd>{detail.data.document_number || detail.data.target_id}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd>{detail.data.status}</dd></div>
              <div><dt className="text-muted-foreground">Document type</dt><dd>{detail.data.target_type}</dd></div>
              <div><dt className="text-muted-foreground">Module</dt><dd>{detail.data.module_code}</dd></div>
              <div><dt className="text-muted-foreground">Requester</dt><dd>{detail.data.requested_by_email || detail.data.requested_by || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Requested</dt><dd>{detail.data.requested_at}</dd></div>
              <div><dt className="text-muted-foreground">Decided by</dt><dd>{detail.data.decided_by_email || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Decided at</dt><dd>{detail.data.decided_at || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Comments</dt><dd className="whitespace-pre-wrap">{detail.data.comments || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Decision reason</dt><dd className="whitespace-pre-wrap">{detail.data.decision_reason || "—"}</dd></div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) {
            setRejectTarget(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject approval</DialogTitle>
            <DialogDescription>A rejection reason is required by the backend.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approval-rejection-reason">Reason</Label>
            <Textarea
              id="approval-rejection-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the rejection reason"
            />
          </div>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setReason(""); }} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busyId !== null || !rejectTarget}
              onClick={() => rejectTarget && void runDecision(rejectTarget, "reject", reason.trim())}
            >
              {busyId === rejectTarget?.id ? "Submitting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegacyApprovalInboxPage() {
  const user = useAuthStore((s) => s.user);
  const rows = useApprovals();
  const status = useApprovalsStatus();
  const rules = useApprovalRules();
  const [filter, setFilter] = useState<FilterKey>("mine");
  const [confirm, setConfirm] = useState<{ action: Decision; row: ApprovalRequest } | null>(null);
  const [delegateTo, setDelegateTo] = useState("");

  const mine = rows.filter((r) => canDecide(r, user));
  const pending = rows.filter((r) => r.status === "pending");
  // Escalation hours come from browser-side rules, so they only apply to offline requests.
  const escalated = pending.filter((r) => !r.typed && isEscalated(r, rules));
  const decided = rows.filter((r) => r.status !== "pending");

  const visible = useMemo(() => {
    if (filter === "mine") return mine;
    if (filter === "pending") return pending;
    if (filter === "escalated") return escalated;
    return decided;
  }, [filter, mine, pending, escalated, decided]);

  const run = async (row: ApprovalRequest, action: "approve" | Decision, reason?: string) => {
    const done = { approve: "approved", reject: "rejected", return: "returned", delegate: "delegated", cancel: "cancelled" } as const;
    if (row.typed) {
      try {
        if (action !== "approve" && action !== "reject" && action !== "cancel") {
          throw new Error("Return and delegate are not supported by the server approval workflow yet.");
        }
        await decideApproval(row.id, action, reason ?? "");
        toast.success(`${row.recordCode} ${done[action]}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
      return;
    }
    const svc = getService(row.entity);
    try {
      if (action === "approve") await svc.approve(row.recordId);
      if (action === "reject") await svc.reject(row.recordId, reason ?? "Rejected");
      if (action === "return") await svc.returnToSender(row.recordId, reason ?? "Returned");
      if (action === "delegate") await svc.delegate(row.recordId, delegateTo || "", reason);
      if (action === "cancel") await svc.cancel(row.recordId, reason ?? "Cancelled");
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

      {status.error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>Could not load approval requests from the server: {status.error}</span>
          <Button size="sm" variant="outline" onClick={status.retry}>
            Retry
          </Button>
        </div>
      )}

      {status.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading approval requests…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing in this queue"
          description={
            status.live
              ? "No server approval requests in this view."
              : "Submit a quotation, leave request or stock adjustment to generate an approval."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const def = getEntity(row.entity);
            const late = !row.typed && isEscalated(row, rules);
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
                    {row.typed ? (
                      <>
                        <p className="mt-1 text-sm">
                          {row.documentType} · {row.department}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Requested by {row.requester} on {row.dueDate}
                          {row.decidedBy ? ` · decided by ${row.decidedBy}` : ""}
                          {row.decidedAt ? ` on ${row.decidedAt.slice(0, 10)}` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm">
                          {row.documentType} · {row.department} · {npr(row.amount)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.requester} · level {row.level}/{row.totalLevels} · {row.mode ?? "sequential"} · {row.approverRole}
                          {row.delegatedTo ? ` · delegated to ${row.delegatedTo}` : ""} · due {row.dueDate}
                        </p>
                      </>
                    )}
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
                        {row.typed ? (
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: "cancel", row })}>
                            Cancel request
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setConfirm({ action: "return", row })}>
                              <RotateCcw className="h-3.5 w-3.5" /> Return
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setDelegateTo(others[0]?.name ?? ""); setConfirm({ action: "delegate", row }); }}>
                              <UserPlus className="h-3.5 w-3.5" /> Delegate
                            </Button>
                          </>
                        )}
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
        title={
          confirm?.action === "reject"
            ? "Reject document"
            : confirm?.action === "cancel"
              ? "Cancel approval request"
              : "Return for information"
        }
        description="The requester is notified. A reason is required."
        requireReason
        confirmLabel={confirm?.action === "reject" ? "Reject" : confirm?.action === "cancel" ? "Cancel request" : "Return"}
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
