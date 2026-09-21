import { createFileRoute } from "@tanstack/react-router";
import { Users, Building2, CalendarCheck, CalendarDays, Wallet, Briefcase, Star } from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/hr")({
  component: HrLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/hr/employees", label: "Employees", icon: Users, formKey: "employee", formLabel: "New Employee" },
  { to: "/hr/departments", label: "Departments", icon: Building2 },
  { to: "/hr/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/hr/leave", label: "Leave", icon: CalendarDays, formKey: "leave", formLabel: "New Request" },
  { to: "/hr/recruitment", label: "Recruitment", icon: Briefcase, formKey: "recruitment", formLabel: "New Requisition" },
  { to: "/hr/performance", label: "Performance", icon: Star, formKey: "performanceReview", formLabel: "New Review" },
  { to: "/hr/payroll", label: "Payroll", icon: Wallet },
];

function HrLayout() {
  return (
    <ModuleTabsLayout
      title="Human Resources"
      description="Employees, departments, attendance, leave, recruitment, performance and payroll"
      tabs={TABS}
    />
  );
}
