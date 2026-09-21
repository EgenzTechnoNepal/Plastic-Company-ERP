import { createFileRoute } from "@tanstack/react-router";
import { AlertsBoard } from "@/features/inventory/AlertsBoard";

export const Route = createFileRoute("/_app/inventory/alerts")({
  component: AlertsBoard,
});
