import { createFileRoute } from "@tanstack/react-router";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/crm/territories")({
  component: () => <EntityListPage entity="territories" />,
});
