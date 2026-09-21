import { createFileRoute } from "@tanstack/react-router";
import { RecordPreviewPage } from "@/features/records/RecordPreviewPage";

export const Route = createFileRoute("/_app/crm/$entity/$id/preview")({
  component: RecordPreviewPage,
});
