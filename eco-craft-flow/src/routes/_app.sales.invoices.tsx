import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, FileText, IndianRupee, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { invoiceBalance, sumField } from "@/lib/records";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/sales/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <EntityListPage
      entity="invoices"
      kpis={(rows) => [
        { label: "Invoices", value: rows.length, icon: FileText },
        { label: "Invoiced", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Collected", value: npr(sumField(rows, "paid")), icon: Wallet, accent: "accent" },
        { label: "Outstanding", value: npr(rows.reduce((s, r) => s + invoiceBalance(r), 0)), icon: AlertTriangle, accent: "muted" },
      ]}
    />
  );
}
