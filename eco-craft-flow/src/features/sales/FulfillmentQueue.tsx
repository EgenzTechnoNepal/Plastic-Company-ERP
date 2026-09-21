import { toast } from "sonner";
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
import { recordTotal, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

type QueueStep = "pick" | "pack";

function inQueue(row: ErpRecord, step: QueueStep) {
  if (step === "pick") {
    return str(row, "allocationStatus") === "Allocated" && str(row, "pickStatus") !== "Picked";
  }
  return str(row, "pickStatus") === "Picked" && str(row, "packStatus") !== "Packed";
}

export function FulfillmentQueue({ step, module = "sales" }: { step: QueueStep; module?: string }) {
  const orders = useRecords("sales_orders");
  const rows = orders.filter((r) => inQueue(r, step));
  const label = step === "pick" ? "Confirm pick" : "Confirm pack";
  const Icon = step === "pick" ? Boxes : Package;

  const run = async (row: ErpRecord) => {
    try {
      await fulfillSalesOrder(row, step);
      toast.success(`${row.code} ${step}ed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fulfilment failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="In queue" value={rows.length} icon={Icon} />
        <KpiCard
          label="Value"
          value={npr(rows.reduce((s, r) => s + recordTotal(r), 0))}
          accent="secondary"
        />
      </div>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName={`sales-${step}ing`}
        auditModule="sales"
        auditEntity="sales_orders"
        emptyMessage={
          step === "pick"
            ? "No allocated orders waiting to pick. Allocate stock on an order first."
            : "No picked orders waiting to pack."
        }
        search={(row, q) => searchRecord(row, q, ["code", "title", "fields.customerName"])}
        searchPlaceholder="Search orders…"
        rowHref={(row) => recordPath("sales_orders", row.code)}
        columns={[
          { key: "code", header: "Order", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, value: (r) => r.code },
          { key: "customer", header: "Customer", cell: (r) => str(r, "customerName") || r.title, value: (r) => str(r, "customerName") || r.title },
          {
            key: "total",
            header: "Amount",
            align: "right",
            cell: (r) => npr(recordTotal(r)),
            value: (r) => recordTotal(r),
          },
          {
            key: "status",
            header: "Fulfilment",
            cell: (r) => (
              <StatusBadge tone="warning">
                {step === "pick" ? str(r, "allocationStatus", "Allocated") : str(r, "pickStatus", "Picked")}
              </StatusBadge>
            ),
            value: (r) => (step === "pick" ? str(r, "allocationStatus") : str(r, "pickStatus")),
          },
          {
            key: "action",
            header: "",
            cell: (r) => (
              <PermissionGuard action="edit" module={module}>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(r);
                  }}
                >
                  {label}
                </Button>
              </PermissionGuard>
            ),
          },
        ]}
      />
    </div>
  );
}
