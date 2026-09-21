import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Clock, LifeBuoy, ShieldAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { slaDeadline } from "@/features/sales/cycle";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/crm/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  return (
    <EntityListPage
      entity="tickets"
      extraFilters={[
        {
          key: "priority",
          placeholder: "All priorities",
          options: ["low", "normal", "high"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "priority") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Tickets", value: rows.length, icon: LifeBuoy },
        { label: "Open", value: rows.filter((r) => r.status === "open" || r.status === "in_progress").length, icon: Clock, accent: "secondary" },
        { label: "SLA overdue", value: rows.filter((r) => slaDeadline(r).overdue).length, icon: ShieldAlert, accent: "muted" },
        { label: "High", value: rows.filter((r) => str(r, "priority") === "high" && r.status !== "closed").length, icon: AlertCircle },
      ]}
    />
  );
}
