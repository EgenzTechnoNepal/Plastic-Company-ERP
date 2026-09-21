import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Receipt, Landmark, Scale, Building2, FileSpreadsheet, GitCompare, Library } from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/accounting")({
  component: AccountingLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/accounting/chart", label: "Chart of Accounts", icon: BookOpen, formKey: "account", formLabel: "New Account" },
  { to: "/accounting/vouchers", label: "Vouchers", icon: Receipt, formKey: "voucher", formLabel: "New Voucher" },
  { to: "/accounting/ledger", label: "Ledger", icon: Library },
  { to: "/accounting/expenses", label: "Expenses", icon: Receipt, formKey: "expense", formLabel: "New Expense" },
  { to: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark, formKey: "voucher", formLabel: "New Entry" },
  { to: "/accounting/statements", label: "Statements", icon: FileSpreadsheet },
  { to: "/accounting/reconciliation", label: "Bank rec", icon: GitCompare },
  { to: "/accounting/assets", label: "Fixed assets", icon: Building2, formKey: "asset", formLabel: "New Asset" },
  { to: "/accounting/outstanding", label: "Outstanding", icon: Scale },
];

function AccountingLayout() {
  return (
    <ModuleTabsLayout
      title="Accounting"
      description="Chart of accounts, vouchers, statements, bank reconciliation, assets and outstanding"
      tabs={TABS}
    />
  );
}
