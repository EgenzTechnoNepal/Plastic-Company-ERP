import { createFileRoute } from "@tanstack/react-router";
import { AbcPage } from "@/features/inventory/AbcPage";

export const Route = createFileRoute("/_app/inventory/abc")({
  component: AbcPage,
});
