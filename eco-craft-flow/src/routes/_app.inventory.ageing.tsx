import { createFileRoute } from "@tanstack/react-router";
import { AgeingPage } from "@/features/inventory/AgeingPage";

export const Route = createFileRoute("/_app/inventory/ageing")({
  component: AgeingPage,
});
