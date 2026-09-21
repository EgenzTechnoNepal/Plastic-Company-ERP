import { createFileRoute } from "@tanstack/react-router";
import { RecordDetailPage } from "@/features/records/RecordDetailPage";

export const Route = createFileRoute("/_app/warehouse/$entity/$id/")({
  component: RecordDetailPage,
});
