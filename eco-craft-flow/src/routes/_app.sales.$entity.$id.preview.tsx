import { createFileRoute } from "@tanstack/react-router";
import { RecordPreviewPage } from "@/features/records/RecordPreviewPage";

export const Route = createFileRoute("/_app/sales/$entity/$id/preview")({
  component: RecordPreviewPage,
});
