import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { npr } from "@/lib/export";
import type { ApprovalRequest } from "@/types/erp";

export function ApprovalPanel({ requests }: { requests: ApprovalRequest[] }) {
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.length === 0 && <p className="text-sm text-muted-foreground">No approval requests.</p>}
        {requests.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                Level {r.level}/{r.totalLevels}
              </span>
              <StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : r.status === "returned" ? "warning" : "warning"}>
                {r.status}
              </StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.requester} · {npr(r.amount)} · L{r.level}/{r.totalLevels} · {r.approverRole}
              {r.delegatedTo ? ` · delegated to ${r.delegatedTo}` : ""}
            </p>
            {r.reason && <p className="mt-1 text-xs">{r.reason}</p>}
          </div>
        ))}
        {pending.length > 0 && (
          <p className="text-xs text-muted-foreground">Use Approve / Reject in the header to decide.</p>
        )}
      </CardContent>
    </Card>
  );
}
