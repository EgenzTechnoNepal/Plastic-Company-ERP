import { createFileRoute } from "@tanstack/react-router";
import { Building2, IndianRupee, UserCog, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/hr/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  return (
    <EntityListPage
      entity="employees"
      extraFilters={[
        {
          key: "department",
          placeholder: "All departments",
          options: ["Sales", "Purchase", "Production", "Warehouse", "Quality", "Accounts", "HR"].map((v) => ({
            value: v,
            label: v,
          })),
          match: (row, value) => str(row, "department") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Employees", value: rows.length, icon: Users },
        { label: "Active", value: rows.filter((r) => r.status === "active").length, icon: UserCog, accent: "accent" },
        { label: "Departments", value: new Set(rows.map((r) => str(r, "department"))).size, icon: Building2, accent: "secondary" },
        { label: "Monthly Basic", value: npr(sumField(rows, "basicSalary")), icon: IndianRupee, accent: "muted" },
      ]}
    />
  );
}
