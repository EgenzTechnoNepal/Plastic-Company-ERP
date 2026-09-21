import { createFileRoute } from "@tanstack/react-router";
import { PlanningMasterPage } from "@/features/inventory/PlanningMasterPage";

export const Route = createFileRoute("/_app/inventory/planning")({
  component: PlanningMasterPage,
});
