import { createFileRoute } from "@tanstack/react-router";
import { CostingPage } from "@/features/production/CostingPage";

export const Route = createFileRoute("/_app/production/costing")({
  component: CostingPage,
});
