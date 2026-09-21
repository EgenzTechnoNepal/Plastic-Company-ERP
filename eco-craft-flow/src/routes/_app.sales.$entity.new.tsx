import { createFileRoute } from "@tanstack/react-router";
import { RecordNewPage } from "@/features/records/RecordFormPage";

export const Route = createFileRoute("/_app/sales/$entity/new")({
  component: RecordNewPage,
});
