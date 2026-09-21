import { createFileRoute } from "@tanstack/react-router";
import { StockLedgerPage } from "@/features/inventory/StockLedger";

export const Route = createFileRoute("/_app/inventory/ledger")({
  component: StockLedgerPage,
});
