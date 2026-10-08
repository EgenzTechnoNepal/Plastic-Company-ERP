import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileText, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { EmptyState } from "@/components/common/EmptyState";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";
import { useAuthStore } from "@/store/auth";

export const Route = createFileRoute("/_app/crm/quotations")({
  component: QuotationsPage,
});

function QuotationsPage() {
  const live = useAuthStore((s) => s.source === "api");
  if (live) {
    return (
      <EmptyState
        title="Live quotations are unavailable"
        description="The backend currently exposes quotations only through legacy DomainRecord compatibility data. Quotation editing, approval, revision, and conversion are disabled in live mode."
      />
    );
  }

  return (
    <EntityListPage
      entity="quotations"
      kpis={(rows) => [
        { label: "Quotations", value: rows.length, icon: FileText },
        { label: "Pipeline Value", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Pending Approval", value: rows.filter((r) => r.status === "pending_approval").length, icon: Clock, accent: "secondary" },
        { label: "Approved", value: rows.filter((r) => r.status === "approved").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
