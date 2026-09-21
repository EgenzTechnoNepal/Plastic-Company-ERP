import { createFileRoute } from "@tanstack/react-router";
import { RecordEditPage } from "@/features/records/RecordFormPage";

export const Route = createFileRoute("/_app/production/$entity/$id/edit")({
  component: RecordEditPage,
});
