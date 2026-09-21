import { createFileRoute } from "@tanstack/react-router";
import { FulfillmentQueue } from "@/features/sales/FulfillmentQueue";

export const Route = createFileRoute("/_app/warehouse/picking")({
  component: () => <FulfillmentQueue step="pick" module="warehouse" />,
});
