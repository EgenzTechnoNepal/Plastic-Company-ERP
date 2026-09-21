import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { creditCheck, fulfillSalesOrder, stockCheck } from "@/features/sales/cycle";
import { npr } from "@/lib/export";
import { str } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

const STEPS = [
  { key: "allocationStatus", label: "Allocate", done: "Allocated", action: "allocate" as const },
  { key: "pickStatus", label: "Pick", done: "Picked", action: "pick" as const },
  { key: "packStatus", label: "Pack", done: "Packed", action: "pack" as const },
  { key: "dispatchStatus", label: "Challan", done: "Dispatched" },
  { key: "invoiceStatus", label: "VAT invoice", done: "Invoiced" },
  { key: "paymentStatus", label: "Payment", done: "Paid" },
];

export function FulfillmentPanel({ order }: { order: ErpRecord }) {
  const customers = useRecords("customers");
  const customer = customers.find((c) => c.code === str(order, "customer"));
  const credit = creditCheck(customer, recordTotal(order));
  const stock = stockCheck(order.lines);

  const run = async (step: "allocate" | "pick" | "pack") => {
    try {
      await fulfillSalesOrder(order, step);
      toast.success(`${order.code} ${step}d`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fulfilment failed");
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fulfilment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Credit: {credit.ok ? "OK" : "blocked"} · {npr(credit.outstanding)} outstanding / {npr(credit.limit)} limit
          {customer ? ` · ${customer.code}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{stock.message}</p>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s) => {
            const value = str(order, s.key);
            const done = value === s.done || (s.key === "paymentStatus" && value.toLowerCase().includes("paid"));
            return (
              <StatusBadge key={s.key} tone={done ? "success" : "neutral"}>
                {s.label}
                {value ? ` · ${value}` : ""}
              </StatusBadge>
            );
          })}
        </div>
        <PermissionGuard action="edit" module="sales">
          <div className="flex flex-wrap gap-2">
            {str(order, "allocationStatus") !== "Allocated" && (
              <Button size="sm" onClick={() => run("allocate")}>
                Allocate stock
              </Button>
            )}
            {str(order, "allocationStatus") === "Allocated" && str(order, "pickStatus") !== "Picked" && (
              <Button size="sm" onClick={() => run("pick")}>
                Confirm pick
              </Button>
            )}
            {str(order, "pickStatus") === "Picked" && str(order, "packStatus") !== "Packed" && (
              <Button size="sm" onClick={() => run("pack")}>
                Confirm pack
              </Button>
            )}
          </div>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}
