import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CalendarClock, CheckCircle2, Phone } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/crm/activities")({
  component: ActivitiesPage,
});

function isOverdue(row: { status: string; fields: Record<string, unknown> }) {
  const due = String(row.fields.dueDate || row.fields.nextDate || "");
  if (!due || row.status === "completed" || row.status === "cancelled") return false;
  return due < new Date().toISOString().slice(0, 10);
}

function ActivitiesPage() {
  return (
    <EntityListPage
      entity="activities"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Call", "Meeting", "Email", "Visit", "Demo"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Activities", value: rows.length, icon: Phone },
        { label: "Open", value: rows.filter((r) => r.status === "open").length, icon: CalendarClock, accent: "secondary" },
        { label: "Overdue", value: rows.filter(isOverdue).length, icon: AlertCircle, accent: "muted" },
        { label: "Done", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
