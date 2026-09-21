import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Layers, ShieldCheck, Timer } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { nf } from "@/lib/export";
import { str, sumField } from "@/lib/records";

export const Route = createFileRoute("/_app/production/batches")({
  component: BatchesPage,
});

function BatchesPage() {
  return (
    <EntityListPage
      entity="batches"
      extraFilters={[
        {
          key: "qcStatus",
          placeholder: "All QC",
          options: ["Pending", "Passed", "Failed"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "qcStatus") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Batches", value: rows.length, icon: Layers },
        { label: "Qty on Batches", value: nf.format(sumField(rows, "qty")), icon: Timer },
        { label: "QC Passed", value: rows.filter((r) => str(r, "qcStatus") === "Passed").length, icon: ShieldCheck, accent: "accent" },
        { label: "Released", value: rows.filter((r) => r.status === "released").length, icon: CheckCircle2, accent: "secondary" },
      ]}
    />
  );
}
