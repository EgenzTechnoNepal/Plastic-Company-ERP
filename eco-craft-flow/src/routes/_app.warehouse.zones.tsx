import { createFileRoute } from "@tanstack/react-router";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { zonesPageConfig } from "@/features/master-data/configs";

export const Route = createFileRoute("/_app/warehouse/zones")({
  component: () => <MasterDataPage config={zonesPageConfig} />,
});
