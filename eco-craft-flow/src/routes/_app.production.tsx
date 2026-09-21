import { createFileRoute } from "@tanstack/react-router";
import {
  Layers,
  Factory,
  FlaskConical,
  Boxes,
  Calculator,
  CalendarClock,
  ClipboardList,
  IndianRupee,
  Cog,
} from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/production")({
  component: ProductionLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/production/plans", label: "Plans", icon: ClipboardList, formKey: "productionPlan", formLabel: "New Plan" },
  { to: "/production/bom", label: "BOM", icon: Layers, formKey: "bom", formLabel: "New BOM" },
  { to: "/production/mrp", label: "MRP", icon: Calculator, formKey: "mrpRun", formLabel: "New MRP Run" },
  { to: "/production/orders", label: "Orders", icon: Factory, formKey: "productionOrder", formLabel: "New Work Order" },
  { to: "/production/issues", label: "Issues", icon: FlaskConical, formKey: "materialIssue", formLabel: "Issue Material" },
  { to: "/production/operations", label: "Operations", icon: Cog, formKey: "operation", formLabel: "New Operation" },
  { to: "/production/scheduling", label: "Schedule", icon: CalendarClock, formKey: "machineSchedule", formLabel: "Schedule Slot" },
  { to: "/production/batches", label: "Batches", icon: Boxes, formKey: "fgBatch", formLabel: "New Batch" },
  { to: "/production/machines", label: "Machines", icon: Cog, formKey: "machine", formLabel: "New Machine" },
  { to: "/production/costing", label: "Costing", icon: IndianRupee },
];

function ProductionLayout() {
  return (
    <ModuleTabsLayout
      title="Production"
      description="Plans, BOM explosion, MRP, work orders, material issue, operations, Gantt and batch costing"
      tabs={TABS}
    />
  );
}
