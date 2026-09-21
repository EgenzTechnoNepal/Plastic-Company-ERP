import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart, Receipt, Wallet, RotateCcw, Package, Boxes, Truck, FileMinus } from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/sales")({
  component: SalesLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/sales/orders", label: "Orders", icon: ShoppingCart, formKey: "salesOrder", formLabel: "New Order" },
  { to: "/sales/picking", label: "Picking", icon: Boxes },
  { to: "/sales/packing", label: "Packing", icon: Package },
  { to: "/sales/deliveries", label: "Deliveries", icon: Truck, formKey: "delivery", formLabel: "New Challan" },
  { to: "/sales/invoices", label: "Invoices", icon: Receipt, formKey: "invoice", formLabel: "New Invoice" },
  { to: "/sales/payments", label: "Payments", icon: Wallet, formKey: "payment", formLabel: "Record Payment" },
  { to: "/sales/returns", label: "Returns", icon: RotateCcw, formKey: "salesReturn", formLabel: "New Return" },
  { to: "/sales/credit-notes", label: "Credit notes", icon: FileMinus, formKey: "creditNote", formLabel: "New Credit Note" },
];

function SalesLayout() {
  return (
    <ModuleTabsLayout
      title="Sales"
      description="Order → pick → pack → gate pass → challan → VAT invoice → payment"
      tabs={TABS}
    />
  );
}
