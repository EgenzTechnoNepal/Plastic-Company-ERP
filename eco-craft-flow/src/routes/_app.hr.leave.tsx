import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock, Umbrella } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/hr/leave")({
  component: LeavePage,
});

function LeavePage() {
  return (
    <EntityListPage
      entity="leave_requests"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Annual", "Sick", "Casual", "Unpaid", "Maternity"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Requests", value: rows.length, icon: Umbrella },
        { label: "Days Requested", value: sumField(rows, "days"), icon: CalendarDays },
        { label: "Pending", value: rows.filter((r) => r.status === "pending_approval").length, icon: Clock, accent: "secondary" },
        { label: "Approved", value: rows.filter((r) => r.status === "approved").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
