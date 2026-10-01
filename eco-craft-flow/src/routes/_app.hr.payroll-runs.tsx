import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/hr/payroll-runs")({
  component: () => <Navigate to="/hr/payroll" replace />,
});
