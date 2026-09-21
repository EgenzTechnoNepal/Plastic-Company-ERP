import { createFileRoute } from "@tanstack/react-router";
import { FulfillmentQueue } from "@/features/sales/FulfillmentQueue";

export const Route = createFileRoute("/_app/sales/packing")({
  component: () => <FulfillmentQueue step="pack" />,
});
