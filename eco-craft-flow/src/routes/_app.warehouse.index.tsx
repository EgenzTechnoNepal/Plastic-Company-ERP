import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/warehouse/")({
  beforeLoad: () => {
    throw redirect({ to: "/warehouse/warehouses" });
  },
});
