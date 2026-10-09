import { createFileRoute } from "@tanstack/react-router";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { supplierItemPricePageConfig } from "@/features/master-data/configs";

export const Route = createFileRoute("/_app/inventory/supplier-prices")({
  component: () => <MasterDataPage config={supplierItemPricePageConfig} />,
});
