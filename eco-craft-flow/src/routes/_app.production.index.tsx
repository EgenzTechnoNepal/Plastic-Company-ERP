import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/production/")({
  beforeLoad: () => {
    throw redirect({ to: "/production/plans" });
  },
});
