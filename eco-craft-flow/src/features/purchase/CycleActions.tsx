import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PermissionGuard } from "@/lib/permissions";
import { isLowStock, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import {
  amendPurchaseOrder,
  convertOcrToBill,
  convertPrToRfq,
  convertGrnToReturn,
  convertReturnToDebitNote,
  convertRfqToPo,
  createBillFromGrn,
  createGateEntry,
  createGrnFromGate,
  inspectGrn,
  payVendorBill,
  raisePrFromProduct,
  simulateOcrExtract,
} from "@/features/purchase/cycle";
import type { ErpRecord } from "@/types/erp";

export function PurchaseCycleActions({ entity, record, module }: { entity: string; record: ErpRecord; module: string }) {
  const navigate = useNavigate();
  const [justifyOpen, setJustifyOpen] = useState(false);
  const go = (next: ErpRecord) => navigate({ to: recordPath(next.entity, next.code) as never });

  const run = async (fn: () => Promise<ErpRecord>, ok: string) => {
    try {
      const next = await fn();
      toast.success(ok);
      go(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (entity === "products" && isLowStock(record)) {
    return (
      <PermissionGuard action="create" module={module === "purchase" ? "purchase" : "inventory"}>
        <Button size="sm" onClick={() => run(() => raisePrFromProduct(record), "Purchase requisition drafted")}>
          Raise PR
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "purchase_requisitions" && (record.status === "approved" || record.status === "completed") && !str(record, "rfq")) {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" onClick={() => run(() => convertPrToRfq(record), "RFQ created with vendor quotes")}>
          Create RFQ
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "rfqs") {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" variant="outline" asChild>
          <Link to={`${recordPath("rfqs", record.code)}/compare` as never}>Compare quotes</Link>
        </Button>
        {str(record, "selectedVendor") && record.status !== "completed" && (
          <Button size="sm" onClick={() => run(() => convertRfqToPo(record), "Purchase order drafted")}>
            Create PO
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "purchase_orders") {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" variant="outline" onClick={() => run(() => amendPurchaseOrder(record), "Amendment created (original kept)")}>
          New amendment
        </Button>
        {(record.status === "approved" || record.status === "in_progress") && str(record, "receiptStatus") !== "Received" && (
          <Button size="sm" onClick={() => run(() => createGateEntry(record), "Gate entry opened")}>
            Gate entry
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "gate_entries" && record.status !== "completed") {
    return (
      <PermissionGuard action="create">
        <Button size="sm" onClick={() => run(() => createGrnFromGate(record), "GRN drafted — pending incoming QC")}>
          Create GRN
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "grns" && str(record, "inspection") === "Pending") {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" onClick={() => run(() => inspectGrn(record, "Passed"), "Incoming inspection passed — stock increased")}>
          QC pass
        </Button>
        <Button size="sm" variant="outline" onClick={() => run(() => inspectGrn(record, "Failed"), "Incoming inspection failed")}>
          QC fail
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "grns" && str(record, "inspection") === "Failed") {
    return (
      <PermissionGuard action="create">
        <Button size="sm" onClick={() => run(() => convertGrnToReturn(record), "Purchase return drafted")}>
          Purchase return
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "grns" && str(record, "inspection") === "Passed" && !str(record, "bill")) {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" onClick={() => run(() => createBillFromGrn(record), "Vendor bill drafted (3-way match run)")}>
          Create vendor bill
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "ocr_bills" && record.status !== "completed") {
    return (
      <PermissionGuard action="edit" module={module}>
        <Button size="sm" variant="outline" onClick={() => run(() => simulateOcrExtract(record), "Simulated OCR extract stored")}>
          Simulate extract
        </Button>
        <Button size="sm" onClick={() => run(() => convertOcrToBill(record), "Vendor bill from OCR")}>
          Convert to bill
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "purchase_bills" && record.status !== "posted" && record.status !== "cancelled") {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" onClick={() => run(() => payVendorBill(record), "Vendor payment drafted")}>
          Pay bill
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "purchase_returns" && record.status !== "completed") {
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" onClick={() => setJustifyOpen(true)}>
          Debit note
        </Button>
        <ConfirmDialog
          open={justifyOpen}
          onOpenChange={setJustifyOpen}
          title="Issue debit note"
          description="Adjusts vendor AP, the VAT purchase register, and the supplier quality scorecard."
          confirmLabel="Create debit note"
          onConfirm={async () => {
            const dn = await convertReturnToDebitNote(record);
            toast.success(`${dn.code} drafted`);
            go(dn);
          }}
        />
      </PermissionGuard>
    );
  }

  return null;
}
