import { createFileRoute } from "@tanstack/react-router";
import { Building2, UserCog, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/hr/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  return (
    <EntityListPage
      entity="departments"
      kpis={(rows) => [
        { label: "Departments", value: rows.length, icon: Building2 },
        { label: "Headcount (seed)", value: sumField(rows, "headcount"), icon: Users },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: UserCog, accent: "accent" },
      ]}
    />
  );
}
