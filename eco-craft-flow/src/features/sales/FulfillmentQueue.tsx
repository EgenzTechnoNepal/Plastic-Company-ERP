import { toast } from "sonner";
import { useState } from "react";
import { Boxes, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { fulfillSalesOrder } from "@/features/sales/cycle";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { searchRecord, str } from "@/lib/records";
import { recordTotal, useRecords, useRecordsStatus } from "@/services/entityService";
import { setSalesOrderFulfillment } from "@/services/api/phase3";
import { toastApiError } from "@/services/api/client";
import { invalidateLive } from "@/services/queryClient";
import { isLiveSession } from "@/store/auth";
import type { ErpRecord } from "@/types/erp";

type QueueStep = "pick" | "pack";

function inQueue(row: ErpRecord, step: QueueStep) {
  if (isLiveSession()) {
    if (step === "pick") return row.status === "approved" && str(row, "pickStatus") !== "DONE";
    return str(row, "pickStatus") === "DONE" && str(row, "packStatus") !== "DONE";
  }
  if (step === "pick") {
    return str(row, "allocationStatus") === "Allocated" && str(row, "pickStatus") !== "Picked";
  }
  return str(row, "pickStatus") === "Picked" && str(row, "packStatus") !== "Packed";
}

export function FulfillmentQueue({ step, module = "sales" }: { step: QueueStep; module?: string }) {
  const orders = useRecords("sales_orders");
  const recordsStatus = useRecordsStatus("sales_orders");
  const live = isLiveSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = orders.filter((r) => inQueue(r, step));
  const label = step === "pick" ? "Confirm pick" : "Confirm pack";
  const Icon = step === "pick" ? Boxes : Package;

  const run = async (row: ErpRecord) => {
    setBusyId(row.id);
    try {
      if (live) {
        await setSalesOrderFulfillment(row.id, step === "pick" ? { pick_status: "DONE" } : { pack_status: "DONE" });
        invalidateLive(["records", "sales_orders"], ["record", "sales_orders", row.id], ["records", "stock_reservations"]);
      } else {
        await fulfillSalesOrder(row, step);
      }
      toast.success(`${row.code} ${step}ed`);
    } catch (err) {
      if (live) toastApiError(err);
      else toast.error(err instanceof Error ? err.message : "Fulfilment failed");
    } finally {
      setBusyId(null);
    }
  };

  const formatAmount = (row: ErpRecord) => {
    const currency = str(row, "currencyCode");
    if (!currency) return "Currency unavailable";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(recordTotal(row));
    } catch {
      return `${currency} ${recordTotal(row).toLocaleString()}`;
    }
  };

  return (
    <div className="space-y-6">
      {!live && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="In queue" value={rows.length} icon={Icon} />
          <KpiCard
            label="Value"
            value={npr(rows.reduce((s, r) => s + recordTotal(r), 0))}
            accent="secondary"
          />
        </div>
      )}
      {live && recordsStatus.loading && (
        <p role="status" className="text-sm text-muted-foreground">Loading sales orders…</p>
      )}
      {live && recordsStatus.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>Could not load sales orders: {recordsStatus.error}</span>
          <Button size="sm" variant="outline" onClick={recordsStatus.retry}>Retry</Button>
        </div>
      )}
      {(!live || (!recordsStatus.loading && !recordsStatus.error)) && (
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName={`sales-${step}ing`}
        auditModule="sales"
        auditEntity="sales_orders"
        emptyMessage={
          step === "pick"
            ? "No reserved orders waiting to pick."
            : "No picked orders waiting to pack."
        }
        search={(row, q) => searchRecord(row, q, ["code", "title", "fields.customerName"])}
        searchPlaceholder="Search orders…"
        rowHref={(row) => recordPath("sales_orders", live ? row.id : row.code)}
        columns={[
          { key: "code", header: "Order", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, value: (r) => r.code },
          { key: "customer", header: "Customer", cell: (r) => str(r, "customerName") || r.title, value: (r) => str(r, "customerName") || r.title },
          {
            key: "total",
            header: "Amount",
            align: "right",
            cell: (r) => live ? formatAmount(r) : npr(recordTotal(r)),
            value: (r) => recordTotal(r),
          },
          {
            key: "status",
            header: "Fulfilment",
            cell: (r) => {
              const status = live
                ? str(r, step === "pick" ? "pickStatus" : "packStatus")
                : step === "pick"
                  ? str(r, "allocationStatus", "Allocated")
                  : str(r, "pickStatus", "Picked");
              return <StatusBadge tone="warning">{status || "—"}</StatusBadge>;
            },
            value: (r) =>
              live
                ? str(r, step === "pick" ? "pickStatus" : "packStatus")
                : step === "pick"
                  ? str(r, "allocationStatus")
                  : str(r, "pickStatus"),
          },
          {
            key: "action",
            header: "",
            cell: (r) => (
              <PermissionGuard action="edit" module={module}>
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(r);
                  }}
                >
                  {busyId === r.id ? "Saving…" : label}
                </Button>
              </PermissionGuard>
            ),
          },
        ]}
      />
      )}
    </div>
  );
}
