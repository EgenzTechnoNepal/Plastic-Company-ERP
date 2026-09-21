import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/purchase/")({
  beforeLoad: () => {
    throw redirect({ to: "/purchase/suppliers" });
  },
});