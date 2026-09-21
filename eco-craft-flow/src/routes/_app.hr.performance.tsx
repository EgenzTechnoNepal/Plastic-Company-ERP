import { createFileRoute } from "@tanstack/react-router";
import { Star, Target, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { num } from "@/lib/records";

export const Route = createFileRoute("/_app/hr/performance")({
  component: PerformancePage,
});

function PerformancePage() {
  return (
    <EntityListPage
      entity="performance_reviews"
      kpis={(rows) => [
        { label: "Reviews", value: rows.length, icon: Users },
        { label: "In progress", value: rows.filter((r) => r.status === "in_progress").length, icon: Target, accent: "secondary" },
        { label: "Avg manager rating", value: rows.length ? (rows.reduce((s, r) => s + num(r, "managerRating"), 0) / rows.length).toFixed(1) : "—", icon: Star, accent: "accent" },
      ]}
    />
  );
}
