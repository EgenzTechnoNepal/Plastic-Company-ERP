import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/accounting/")({
  beforeLoad: () => {
    throw redirect({ to: "/accounting/vouchers" });
  },
});
