import { ArrowDownToLine, ArrowUpFromLine, BookOpen, FileClock } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { num } from "@/lib/records";

export function StockLedgerPage() {
  return (
    <EntityListPage
      entity="stock_movements"
      kpis={(rows) => [
        { label: "Ledger entries", value: rows.length, icon: BookOpen },
        { label: "Inbound rows", value: rows.filter((r) => num(r, "quantityIn") > 0).length, icon: ArrowDownToLine, accent: "accent" },
        { label: "Outbound rows", value: rows.filter((r) => num(r, "quantityOut") > 0).length, icon: ArrowUpFromLine, accent: "secondary" },
        { label: "State events", value: rows.filter((r) => Boolean(r.fields.isStateEvent)).length, icon: FileClock, accent: "muted" },
      ]}
    />
  );
}
