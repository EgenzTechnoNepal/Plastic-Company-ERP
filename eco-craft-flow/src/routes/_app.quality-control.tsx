import { createFileRoute } from "@tanstack/react-router";
import {
  PackageSearch,
  Activity,
  BadgeCheck,
  Lock,
  FileWarning,
  ClipboardCheck,
  ClipboardList,
  Wrench,
  FileBadge,
} from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/quality-control")({
  component: QualityLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/quality-control/plans", label: "Plans", icon: ClipboardList, formKey: "qualityPlan", formLabel: "New Plan" },
  { to: "/quality-control/incoming", label: "Incoming", icon: PackageSearch, formKey: "qcInspection", formLabel: "New Inspection" },
  { to: "/quality-control/in-process", label: "In-Process", icon: Activity, formKey: "qcInspection", formLabel: "New Check" },
  { to: "/quality-control/finished", label: "Final", icon: BadgeCheck, formKey: "qcInspection", formLabel: "New Inspection" },
  { to: "/quality-control/instruments", label: "Instruments", icon: Wrench, formKey: "instrument", formLabel: "New Instrument" },
  { to: "/quality-control/coa", label: "CoA", icon: FileBadge, formKey: "certificate", formLabel: "New CoA" },
  { to: "/quality-control/quarantine", label: "Quarantine", icon: Lock },
  { to: "/quality-control/ncr", label: "NCR", icon: FileWarning, formKey: "ncr", formLabel: "Raise NCR" },
  { to: "/quality-control/capa", label: "CAPA", icon: ClipboardCheck, formKey: "capa", formLabel: "New CAPA" },
];

function QualityLayout() {
  return (
    <ModuleTabsLayout
      title="Quality Control"
      description="Plans, inspections, CoA, quarantine hold/release, NCR and CAPA under ISO 17088"
      tabs={TABS}
    />
  );
}
