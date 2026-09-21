import { createFileRoute } from "@tanstack/react-router";
import { EntityListPage } from "@/components/common/EntityListPage";

export const Route = createFileRoute("/_app/crm/contacts")({
  component: () => <EntityListPage entity="contacts" />,
});
