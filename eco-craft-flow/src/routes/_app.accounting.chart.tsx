import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Landmark, Scale, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";

export const Route = createFileRoute("/_app/accounting/chart")({
  component: ChartOfAccountsPage,
});

function ChartOfAccountsPage() {
  return (
    <EntityListPage
      entity="accounts"
      extraFilters={[
        {
          key: "group",
          placeholder: "All groups",
          options: ["Asset", "Liability", "Equity", "Income", "Expense"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "group") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Accounts", value: rows.length, icon: BookOpen },
        { label: "Assets", value: npr(rows.filter((r) => str(r, "group") === "Asset").reduce((s, r) => s + num(r, "balance"), 0)), icon: Landmark, accent: "accent" },
        { label: "Income", value: npr(rows.filter((r) => str(r, "group") === "Income").reduce((s, r) => s + num(r, "balance"), 0)), icon: Wallet, accent: "secondary" },
        { label: "Expense", value: npr(rows.filter((r) => str(r, "group") === "Expense").reduce((s, r) => s + num(r, "balance"), 0)), icon: Scale, accent: "muted" },
      ]}
    />
  );
}
