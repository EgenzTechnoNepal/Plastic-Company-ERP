import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ReceiptText, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { recordNewPath, recordPath } from "@/features/registry/paths";
import { cancelSalesInvoice, postDispatchNote, postSalesInvoice } from "@/services/api/phase3";
import { invalidateLive } from "@/services/queryClient";
import type { ErpRecord } from "@/types/erp";

function text(value: unknown): string {
  return value == null || value === "" ? "" : String(value);
}

export function SalesDocumentActions({ entity, record }: { entity: string; record: ErpRecord }) {
  const [busy, setBusy] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const salesOrderId = text(record.fields.salesOrder);
  const dispatchId = entity === "deliveries" ? record.id : text(record.fields.dispatchNote ?? record.fields.delivery);

  const refresh = () =>
    invalidateLive(
      ["records", entity],
      ["record", entity, record.id],
      ["records", "sales_orders"],
      ...(salesOrderId ? [["record", "sales_orders", salesOrderId] as unknown[]] : []),
      ["records", "deliveries"],
      ...(dispatchId ? [["record", "deliveries", dispatchId] as unknown[]] : []),
      ["records", "invoices"],
      ["records", "stock_reservations"],
      ["records", "stock_movements"],
      ["records", "inventory_lots"],
    );

  const run = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label);
    try {
      await fn();
      refresh();
      toast.success(`${record.code} ${label}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`);
      return false;
    } finally {
      setBusy("");
    }
  };

  if (entity !== "deliveries" && entity !== "invoices") return null;

  return (
    <>
      <Card className="rounded-2xl border-border/60">
        <CardContent className="flex flex-wrap gap-2 py-3">
          {salesOrderId && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to={recordPath("sales_orders", salesOrderId) as never}>
                <Truck className="h-4 w-4" /> Sales Order
              </Link>
            </Button>
          )}
          {entity === "deliveries" && record.status === "draft" && (
            <Button size="sm" className="gap-1.5" disabled={Boolean(busy)} onClick={() => run("posted", () => postDispatchNote(record.id))}>
              <Send className="h-4 w-4" /> {busy === "posted" ? "Posting..." : "Post dispatch"}
            </Button>
          )}
          {entity === "deliveries" && record.status === "posted" && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to={`${recordNewPath("invoices")}?dispatch_note=${encodeURIComponent(record.id)}${salesOrderId ? `&sales_order=${encodeURIComponent(salesOrderId)}` : ""}` as never}>
                <ReceiptText className="h-4 w-4" /> Create invoice
              </Link>
            </Button>
          )}
          {entity === "invoices" && dispatchId && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to={recordPath("deliveries", dispatchId) as never}>
                <Truck className="h-4 w-4" /> Dispatch
              </Link>
            </Button>
          )}
          {entity === "invoices" && record.status === "draft" && (
            <>
              <Button size="sm" className="gap-1.5" disabled={Boolean(busy)} onClick={() => run("posted", () => postSalesInvoice(record.id))}>
                <Send className="h-4 w-4" /> {busy === "posted" ? "Posting..." : "Post invoice"}
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setCancelOpen(true)}>
                Cancel invoice
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel invoice"
        description="Only draft invoices can be cancelled by the backend."
        confirmLabel={busy === "cancelled" ? "Cancelling..." : "Cancel invoice"}
        tone="destructive"
        onConfirm={() => run("cancelled", () => cancelSalesInvoice(record.id))}
      />
    </>
  );
}
