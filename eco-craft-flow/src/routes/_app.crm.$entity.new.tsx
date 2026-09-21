import { createFileRoute } from "@tanstack/react-router";
import { RecordNewPage } from "@/features/records/RecordFormPage";

export const Route = createFileRoute("/_app/crm/$entity/new")({
  component: RecordNewPage,
});
