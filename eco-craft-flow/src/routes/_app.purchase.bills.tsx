import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, IndianRupee, Receipt, ShieldAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { str } from "@/lib/records";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/purchase/bills")({
  component: VendorBillsPage,
});

function VendorBillsPage() {
  return (
    <EntityListPage
      entity="purchase_bills"
      extraFilters={[
        {
          key: "matchStatus",
          placeholder: "All matches",
          options: ["Pending", "3-Way Matched", "Exception"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "matchStatus") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Vendor bills", value: rows.length, icon: Receipt },
        { label: "Payable", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "3-way matched", value: rows.filter((r) => str(r, "matchStatus") === "3-Way Matched").length, icon: CheckCircle2, accent: "accent" },
        { label: "Exceptions", value: rows.filter((r) => str(r, "matchStatus") === "Exception").length, icon: ShieldAlert, accent: "muted" },
      ]}
    />
  );
}
