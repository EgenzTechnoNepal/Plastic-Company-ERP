import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText, IndianRupee, ReceiptText } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { num } from "@/lib/records";

export const Route = createFileRoute("/_app/sales/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <EntityListPage
      entity="invoices"
      kpis={(rows) => [
        { label: "Invoices", value: rows.length, icon: FileText },
        { label: "Backend Total", value: npr(rows.reduce((s, r) => s + num(r, "invoiceTotal"), 0)), icon: IndianRupee },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: ReceiptText, accent: "muted" },
      ]}
    />
  );
}
