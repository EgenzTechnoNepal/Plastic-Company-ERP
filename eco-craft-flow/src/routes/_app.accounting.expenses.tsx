import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Receipt, Tag, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/accounting/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  return (
    <EntityListPage
      entity="expenses"
      extraFilters={[
        {
          key: "category",
          placeholder: "All categories",
          options: ["Utilities", "Freight & Transport", "Repairs", "Travel", "Office", "Marketing"].map((v) => ({
            value: v,
            label: v,
          })),
          match: (row, value) => str(row, "category") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Expenses", value: rows.length, icon: Receipt },
        { label: "Amount", value: npr(sumField(rows, "amount")), icon: Wallet },
        { label: "Approved", value: rows.filter((r) => r.status === "approved").length, icon: CheckCircle2, accent: "accent" },
        { label: "Categories", value: new Set(rows.map((r) => str(r, "category"))).size, icon: Tag, accent: "muted" },
      ]}
    />
  );
}
