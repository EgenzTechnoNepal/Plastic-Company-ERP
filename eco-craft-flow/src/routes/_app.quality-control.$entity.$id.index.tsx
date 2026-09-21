import { createFileRoute } from "@tanstack/react-router";
import { RecordDetailPage } from "@/features/records/RecordDetailPage";

export const Route = createFileRoute("/_app/quality-control/$entity/$id/")({
  component: RecordDetailPage,
});
