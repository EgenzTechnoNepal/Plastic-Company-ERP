import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, FileBadge, FlaskConical, Printer } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { str } from "@/lib/records";

export const Route = createFileRoute("/_app/quality-control/coa")({
  component: CoaPage,
});

function CoaPage() {
  return (
    <EntityListPage
      entity="certificates"
      extraFilters={[
        {
          key: "result",
          placeholder: "All results",
          options: ["Pass", "Fail"].map((v) => ({ value: v, label: v })),
          match: (row, value) => str(row, "result") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Certificates", value: rows.length, icon: FileBadge },
        { label: "Issued", value: rows.filter((r) => r.status === "completed").length, icon: BadgeCheck, accent: "accent" },
        { label: "ISO 17088", value: rows.filter((r) => /17088/.test(str(r, "standard"))).length, icon: FlaskConical, accent: "secondary" },
        { label: "Printable", value: rows.length, icon: Printer, accent: "muted" },
      ]}
    />
  );
}
