import { createFileRoute } from "@tanstack/react-router";
import { FulfillmentQueue } from "@/features/sales/FulfillmentQueue";

export const Route = createFileRoute("/_app/warehouse/packing")({
  component: () => <FulfillmentQueue step="pack" module="warehouse" />,
});
