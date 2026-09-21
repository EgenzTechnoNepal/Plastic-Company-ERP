import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/integrations/")({
  beforeLoad: () => {
    throw redirect({ to: "/integrations/whatsapp" });
  },
});
