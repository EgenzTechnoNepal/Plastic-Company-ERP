import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, GitCompare, Send, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/purchase/rfqs")({
  component: RfqsPage,
});

function RfqsPage() {
  return (
    <EntityListPage
      entity="rfqs"
      kpis={(rows) => [
        { label: "RFQs", value: rows.length, icon: GitCompare },
        { label: "In progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Send, accent: "secondary" },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
        { label: "Open", value: rows.filter((r) => r.status !== "completed" && r.status !== "cancelled").length, icon: Users, accent: "muted" },
      ]}
    />
  );
}
