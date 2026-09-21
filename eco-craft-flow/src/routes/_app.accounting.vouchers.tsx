import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, FileText, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str } from "@/lib/records";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/vouchers")({
  component: VouchersPage,
});

function VouchersPage() {
  return (
    <EntityListPage
      entity="vouchers"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Journal", "Payment", "Receipt", "Contra", "Adjustment"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Vouchers", value: rows.length, icon: BookOpen },
        { label: "Posted Value", value: npr(rows.filter((r) => r.status === "posted").reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
        { label: "Draft / Pending", value: rows.filter((r) => r.status === "draft" || r.status === "pending_approval").length, icon: FileText, accent: "secondary" },
      ]}
    />
  );
}
