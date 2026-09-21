import { createFileRoute } from "@tanstack/react-router";
import {
  MapPin,
  PackagePlus,
  Truck,
  ClipboardList,
  ArrowLeftRight,
  Boxes,
  Package,
  Lock,
  Warehouse,
} from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/warehouse")({
  component: WarehouseLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/warehouse/warehouses", label: "Warehouses", icon: Warehouse, formKey: "warehouse", formLabel: "New Warehouse" },
  { to: "/warehouse/locations", label: "Locations", icon: MapPin, formKey: "warehouseLocation", formLabel: "New Bin" },
  { to: "/warehouse/putaway", label: "Put-away", icon: Warehouse },
  { to: "/warehouse/receiving", label: "Receiving", icon: PackagePlus, formKey: "goodsReceipt", formLabel: "New Receipt" },
  { to: "/warehouse/picking", label: "Picking", icon: Boxes },
  { to: "/warehouse/packing", label: "Packing", icon: Package },
  { to: "/warehouse/dispatch", label: "Dispatch", icon: Truck, formKey: "delivery", formLabel: "New Dispatch" },
  { to: "/warehouse/transfers", label: "Transfers", icon: ArrowLeftRight, formKey: "stockTransfer", formLabel: "New Transfer" },
  { to: "/warehouse/bin-transfers", label: "Bin move", icon: ArrowLeftRight, formKey: "binTransfer", formLabel: "New Bin Move" },
  { to: "/warehouse/count", label: "Count", icon: ClipboardList, formKey: "stockCount", formLabel: "New Count" },
  { to: "/warehouse/quarantine", label: "Quarantine", icon: Lock },
];

function WarehouseLayout() {
  return (
    <ModuleTabsLayout
      title="Warehouse"
      description="Bins · put-away · pick/pack · WH transfer in-transit · bin-to-bin · count variance · quarantine / consignment"
      tabs={TABS}
    />
  );
}
