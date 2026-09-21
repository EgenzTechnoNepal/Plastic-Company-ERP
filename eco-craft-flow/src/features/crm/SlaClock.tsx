import { slaDeadline } from "@/features/sales/cycle";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ErpRecord } from "@/types/erp";

export function SlaClock({ ticket }: { ticket: ErpRecord }) {
  const { due, overdue, remainingMs } = slaDeadline(ticket);
  if (ticket.status === "closed" || ticket.status === "completed") {
    return <StatusBadge tone="success">SLA closed</StatusBadge>;
  }
  const abs = Math.abs(remainingMs);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const label = overdue ? `${hours}h ${mins}m overdue` : `${hours}h ${mins}m left`;
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">SLA clock · due {due.toLocaleString()}</p>
      <div className="mt-1 flex items-center gap-2">
        <StatusBadge tone={overdue ? "danger" : "warning"}>{label}</StatusBadge>
      </div>
    </div>
  );
}
