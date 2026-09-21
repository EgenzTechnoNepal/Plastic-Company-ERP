import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Landmark, Truck, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/payments")({
  component: VendorPaymentsPage,
});

function VendorPaymentsPage() {
  return (
    <EntityListPage
      entity="vendor_payments"
      extraFilters={[
        {
          key: "mode",
          placeholder: "All modes",
          options: ["Cash", "Bank Transfer", "Cheque"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "mode") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Payments", value: rows.length, icon: Wallet },
        { label: "Paid Out", value: npr(sumField(rows, "amount")), icon: Banknote },
        { label: "Bank Transfer", value: rows.filter((r) => str(r, "mode") === "Bank Transfer").length, icon: Landmark, accent: "secondary" },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: Truck, accent: "accent" },
      ]}
    />
  );
}
