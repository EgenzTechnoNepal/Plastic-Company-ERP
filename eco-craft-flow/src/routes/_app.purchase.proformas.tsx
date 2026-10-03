import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Clock, FileSpreadsheet, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";

export const Route = createFileRoute("/_app/purchase/proformas")({
  component: ProformaInvoicesPage,
});

function ProformaInvoicesPage() {
  return (
    <EntityListPage
      entity="proforma_invoices"
      kpis={(rows) => [
        { label: "Proforma Invoices", value: rows.length, icon: FileSpreadsheet },
        {
          label: "Total value",
          value: npr(rows.reduce((s, r) => s + Number(r.fields?.totalAmount ?? 0), 0)),
          icon: IndianRupee,
        },
        {
          label: "Open",
          value: rows.filter((r) => !["ACCEPTED", "CANCELLED", "SUPERSEDED"].includes(String(r.status))).length,
          icon: Clock,
          accent: "secondary",
        },
        { label: "With lead time", value: rows.filter((r) => Number(r.fields?.leadTimeDays ?? 0) > 0).length, icon: ClipboardList, accent: "accent" },
      ]}
    />
  );
}
