import { createFileRoute } from "@tanstack/react-router";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { uomPageConfig } from "@/features/master-data/configs";

export const Route = createFileRoute("/_app/inventory/uom")({
  component: () => <MasterDataPage config={uomPageConfig} />,
});
