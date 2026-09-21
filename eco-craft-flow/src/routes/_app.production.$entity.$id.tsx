import { createFileRoute } from "@tanstack/react-router";
import { RecordIdLayout } from "@/features/records/RecordIdLayout";

export const Route = createFileRoute("/_app/production/$entity/$id")({
  component: RecordIdLayout,
});
