import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Landmark, Smartphone, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/sales/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <EntityListPage
      entity="payments"
      extraFilters={[
        {
          key: "mode",
          placeholder: "All modes",
          options: ["Cash", "Bank Transfer", "Cheque", "eSewa", "Khalti"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "mode") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Receipts", value: rows.length, icon: Wallet },
        { label: "Collected", value: npr(sumField(rows, "amount")), icon: Banknote },
        { label: "Bank", value: rows.filter((r) => str(r, "mode") === "Bank Transfer").length, icon: Landmark, accent: "secondary" },
        { label: "Wallets", value: rows.filter((r) => ["eSewa", "Khalti"].includes(str(r, "mode"))).length, icon: Smartphone, accent: "muted" },
      ]}
    />
  );
}
