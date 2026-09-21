import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileMinus, IndianRupee } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";
import { recordTotal } from "@/services/entityService";

export const Route = createFileRoute("/_app/sales/credit-notes")({
  component: CreditNotesPage,
});

function CreditNotesPage() {
  return (
    <EntityListPage
      entity="credit_notes"
      kpis={(rows) => [
        { label: "Credit notes", value: rows.length, icon: FileMinus },
        { label: "Value", value: npr(rows.reduce((s, r) => s + recordTotal(r), 0)), icon: IndianRupee },
        { label: "Draft", value: rows.filter((r) => r.status === "draft").length, icon: Clock, accent: "secondary" },
        { label: "Posted", value: rows.filter((r) => r.status === "posted").length, icon: CheckCircle2, accent: "accent" },
      ]}
    />
  );
}
