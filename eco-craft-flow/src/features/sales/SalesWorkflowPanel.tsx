import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PackageCheck, RotateCcw, Truck, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { recordNewPath, recordPath } from "@/features/registry/paths";
import { confirmSalesOrder, releaseSalesOrderReservations, setSalesOrderFulfillment } from "@/services/api/phase3";
import { useRecords, useRecordsStatus } from "@/services/entityService";
import { invalidateLive } from "@/services/queryClient";
import { statusLabel } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

function text(value: unknown): string {
  return value == null || value === "" ? "-" : String(value);
}

function qty(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : text(value);
}

function done(value: unknown): boolean {
  return String(value ?? "") === "DONE";
}

export function SalesWorkflowPanel({ order }: { order: ErpRecord }) {
  const [busy, setBusy] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const lines = Array.isArray(order.fields.salesOrderLines) ? order.fields.salesOrderLines as Array<Record<string, unknown>> : [];
  const availability = order.fields.lineAvailability && typeof order.fields.lineAvailability === "object"
    ? order.fields.lineAvailability as Record<string, Record<string, unknown> | undefined>
    : {};
  const dispatches = useRecords("deliveries", { sales_order: order.id });
  const invoices = useRecords("invoices");
  const dispatchStatus = useRecordsStatus("deliveries", undefined, { sales_order: order.id });
  const relatedInvoices = invoices.filter((row) => row.fields.salesOrder === order.id || dispatches.some((dn) => row.fields.dispatchNote === dn.id));
  const postedDispatch = dispatches.find((row) => row.status === "posted");
  const draftDispatch = dispatches.find((row) => row.status === "draft");

  const refresh = () => invalidateLive(["records", "sales_orders"], ["record", "sales_orders", order.id], ["records", "deliveries"], ["records", "invoices"], ["records", "stock_reservations"], ["records", "stock_movements"], ["records", "inventory_lots"]);

  const reserve = async () => {
    setBusy("reserve");
    try {
      await confirmSalesOrder(order.id);
      refresh();
      toast.success(`${order.code} reserved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setBusy("");
    }
  };

  const run = async (label: string, body: { pick_status?: string; pack_status?: string }) => {
    setBusy(label);
    try {
      await setSalesOrderFulfillment(order.id, body);
      refresh();
      toast.success(`${order.code} ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sales workflow action failed");
    } finally {
      setBusy("");
    }
  };

  const release = async () => {
    setBusy("release");
    try {
      await releaseSalesOrderReservations(order.id);
      refresh();
      toast.success(`${order.code} reservations released`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setBusy("");
      setReleaseOpen(false);
    }
  };

  return (
    <>
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales Flow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge tone={Number(order.fields.reservedQuantity ?? 0) > 0 ? "success" : "neutral"}>
            Reservation · {statusLabel(text(order.fields.reservationStatus))}
          </StatusBadge>
          <StatusBadge tone={done(order.fields.pickStatus) ? "success" : "neutral"}>Picking · {text(order.fields.pickStatus)}</StatusBadge>
          <StatusBadge tone={done(order.fields.packStatus) ? "success" : "neutral"}>Packing · {text(order.fields.packStatus)}</StatusBadge>
          <StatusBadge tone={Number(order.fields.dispatchedQuantity ?? 0) > 0 ? "success" : "neutral"}>Dispatch · {qty(order.fields.dispatchedQuantity)}</StatusBadge>
          <StatusBadge tone={Number(order.fields.invoicedQuantity ?? 0) > 0 ? "success" : "neutral"}>Invoice · {qty(order.fields.invoicedQuantity)}</StatusBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Line</th>
                <th>Item</th>
                <th>Warehouse</th>
                <th className="text-right">Ordered</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Dispatched</th>
                <th className="text-right">Available to consume</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const bal = availability[text(line.id)];
                return (
                  <tr key={text(line.id)} className="border-t">
                    <td className="py-2">{text(line.line_no)}</td>
                    <td className="font-mono text-xs">{text(line.item)}</td>
                    <td className="font-mono text-xs">{text(line.warehouse ?? order.fields.warehouse)}</td>
                    <td className="text-right">{qty(line.ordered_quantity)}</td>
                    <td className="text-right">{qty(line.reserved_quantity)}</td>
                    <td className="text-right">{qty(line.dispatched_quantity)}</td>
                    <td className="text-right">{bal ? qty(bal.available_to_consume) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PermissionGuard action="edit" module="sales">
          <div className="flex flex-wrap gap-2">
            {order.status === "draft" && (
              <Button size="sm" className="gap-1.5" disabled={Boolean(busy)} onClick={reserve}>
                <PackageCheck className="h-4 w-4" /> Reserve stock
              </Button>
            )}
            {!done(order.fields.pickStatus) && order.status === "approved" && (
              <Button size="sm" className="gap-1.5" disabled={Boolean(busy)} onClick={() => run("picked", { pick_status: "DONE" })}>
                <PackageCheck className="h-4 w-4" /> Confirm pick
              </Button>
            )}
            {done(order.fields.pickStatus) && !done(order.fields.packStatus) && (
              <Button size="sm" className="gap-1.5" disabled={Boolean(busy)} onClick={() => run("packed", { pack_status: "DONE" })}>
                <PackageCheck className="h-4 w-4" /> Confirm pack
              </Button>
            )}
            {Number(order.fields.reservedQuantity ?? 0) > 0 && Number(order.fields.dispatchedQuantity ?? 0) === 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={Boolean(busy)} onClick={() => setReleaseOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Release reservations
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to={`${recordNewPath("deliveries")}?sales_order=${encodeURIComponent(order.id)}` as never}>
                <Truck className="h-4 w-4" /> Create dispatch
              </Link>
            </Button>
            {draftDispatch && (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link to={recordPath("deliveries", draftDispatch.id) as never}>
                  <Truck className="h-4 w-4" /> Open draft dispatch
                </Link>
              </Button>
            )}
            {postedDispatch ? (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link to={`${recordNewPath("invoices")}?dispatch_note=${encodeURIComponent(postedDispatch.id)}&sales_order=${encodeURIComponent(order.id)}` as never}>
                  <ReceiptText className="h-4 w-4" /> Create invoice
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" disabled>
                <ReceiptText className="h-4 w-4" /> Create invoice after posted dispatch
              </Button>
            )}
          </div>
        </PermissionGuard>
        </CardContent>
        {(dispatches.length > 0 || relatedInvoices.length > 0 || dispatchStatus.loading) && (
          <div className="border-t px-6 py-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {dispatchStatus.loading && <span className="text-muted-foreground">Loading dispatches...</span>}
              {dispatches.map((dispatch) => (
                <Button key={dispatch.id} asChild variant="ghost" size="sm" className="h-8">
                  <Link to={recordPath("deliveries", dispatch.id) as never}>
                    Dispatch {dispatch.code} · {statusLabel(dispatch.status)}
                  </Link>
                </Button>
              ))}
              {relatedInvoices.map((invoice) => (
                <Button key={invoice.id} asChild variant="ghost" size="sm" className="h-8">
                  <Link to={recordPath("invoices", invoice.id) as never}>
                    Invoice {invoice.code} · {statusLabel(invoice.status)}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title="Release reservations"
        description="The backend will release open reservations for this Sales Order. This cannot be used after dispatch."
        confirmLabel={busy === "release" ? "Releasing..." : "Release"}
        onConfirm={release}
      />
    </>
  );
}
