import { createFileRoute } from "@tanstack/react-router";
import { RecordIdLayout } from "@/features/records/RecordIdLayout";

export const Route = createFileRoute("/_app/inventory/$entity/$id")({
  component: RecordIdLayout,
});
