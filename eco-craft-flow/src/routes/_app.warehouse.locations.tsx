import { createFileRoute } from "@tanstack/react-router";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { binsPageConfig } from "@/features/master-data/configs";

export const Route = createFileRoute("/_app/warehouse/locations")({
  component: LocationsPage,
});

function LocationsPage() {
  return <MasterDataPage config={binsPageConfig} />;
}
