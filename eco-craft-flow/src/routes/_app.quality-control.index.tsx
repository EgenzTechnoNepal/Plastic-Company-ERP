import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/quality-control/")({
  beforeLoad: () => {
    throw redirect({ to: "/quality-control/plans" });
  },
});
