import { createFileRoute } from "@tanstack/react-router";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { racksPageConfig } from "@/features/master-data/configs";

export const Route = createFileRoute("/_app/warehouse/racks")({
  component: () => <MasterDataPage config={racksPageConfig} />,
});
