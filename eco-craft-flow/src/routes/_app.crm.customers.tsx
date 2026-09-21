import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, IndianRupee, TrendingUp, Users } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { num, str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/crm/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <EntityListPage
      entity="customers"
      extraFilters={[
        {
          key: "type",
          placeholder: "All types",
          options: ["Corporate", "Retail", "Government", "Dealer"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "type") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Total Customers", value: rows.length, icon: Users },
        { label: "YTD Sales", value: npr(sumField(rows, "ytdSales")), icon: TrendingUp },
        { label: "Outstanding", value: npr(sumField(rows, "outstanding")), icon: IndianRupee },
        { label: "With Dues", value: rows.filter((r) => num(r, "outstanding") > 0).length, icon: AlertCircle },
      ]}
    />
  );
}
