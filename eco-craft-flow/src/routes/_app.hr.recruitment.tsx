import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, UserPlus, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/hr/recruitment")({
  component: RecruitmentPage,
});

function RecruitmentPage() {
  return (
    <EntityListPage
      entity="recruitment"
      extraFilters={[
        {
          key: "stage",
          placeholder: "All stages",
          options: ["Sourcing", "Screening", "Interview", "Offer", "Hired"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "stage") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Requisitions", value: rows.length, icon: Briefcase },
        { label: "Open", value: rows.filter((r) => r.status === "open").length, icon: UserPlus, accent: "accent" },
        { label: "Departments", value: new Set(rows.map((r) => str(r, "department"))).size, icon: Users, accent: "secondary" },
      ]}
    />
  );
}
