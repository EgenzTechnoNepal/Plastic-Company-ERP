import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, Landmark, ShieldAlert } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { npr } from "@/lib/export";

export const Route = createFileRoute("/_app/purchase/letters-of-credit")({
  component: LettersOfCreditPage,
});

function LettersOfCreditPage() {
  return (
    <EntityListPage
      entity="letters_of_credit"
      kpis={(rows) => [
        { label: "Letters of Credit", value: rows.length, icon: Landmark },
        {
          label: "LC value",
          value: npr(rows.reduce((s, r) => s + Number(r.fields?.amount ?? 0), 0)),
          icon: Clock,
        },
        {
          label: "Cleared to dispatch",
          value: rows.filter((r) => String(r.status) === "DOCS_CLEARED").length,
          icon: CheckCircle2,
          accent: "accent",
        },
        {
          label: "Blocked / missing docs",
          value: rows.filter((r) => ["DOCS_BLOCKED", "AI_MATCH_FAILED"].includes(String(r.status))).length,
          icon: ShieldAlert,
          accent: "secondary",
        },
      ]}
    />
  );
}
