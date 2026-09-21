import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Clock, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/purchase/requisitions")({
  component: RequisitionsPage,
});

function RequisitionsPage() {
  return (
    <EntityListPage
      entity="purchase_requisitions"
      kpis={(rows) => [
        { label: "Requisitions", value: rows.length, icon: ClipboardList },
        { label: "Value", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Pending approval", value: rows.filter((r) => r.status === "pending_approval").length, icon: Clock, accent: "muted" },
        { label: "Approved", value: rows.filter((r) => r.status === "approved" || r.status === "completed").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
