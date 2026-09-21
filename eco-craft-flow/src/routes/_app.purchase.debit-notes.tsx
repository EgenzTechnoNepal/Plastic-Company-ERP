import { createFileRoute } from "@tanstack/react-router";
import { FileMinus, IndianRupee, RotateCcw, Truck } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/purchase/debit-notes")({
  component: DebitNotesPage,
});

function DebitNotesPage() {
  return (
    <EntityListPage
      entity="debit_notes"
      kpis={(rows) => [
        { label: "Debit notes", value: rows.length, icon: FileMinus },
        { label: "Value", value: npr(sumField(rows, "amount")), icon: IndianRupee },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: Truck, accent: "accent" },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: RotateCcw, accent: "muted" },
      ]}
    />
  );
}
