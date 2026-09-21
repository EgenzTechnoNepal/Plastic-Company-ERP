import { createFileRoute } from "@tanstack/react-router";
import { PutawayQueue } from "@/features/warehouse/PutawayQueue";

export const Route = createFileRoute("/_app/warehouse/putaway")({
  component: PutawayQueue,
});
