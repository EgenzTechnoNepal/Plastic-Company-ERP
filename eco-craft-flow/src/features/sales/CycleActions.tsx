import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PermissionGuard } from "@/lib/permissions";
import { recordPath } from "@/features/registry/paths";
import {
  DISCOUNT_THRESHOLD_PCT,
  convertDeliveryToInvoice,
  convertLeadToOpportunity,
  convertOrderToDelivery,
  convertQuotationToOrder,
  convertReturnToCreditNote,
  dispatchQuotation,
  markLeadLost,
  maxDiscountPct,
  reviseQuotation,
} from "@/features/sales/cycle";
import type { ErpRecord } from "@/types/erp";

export function CycleActions({ entity, record, module }: { entity: string; record: ErpRecord; module: string }) {
  const navigate = useNavigate();
  const [lostOpen, setLostOpen] = useState(false);
  const [ncrOpen, setNcrOpen] = useState(false);
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

  if (entity === "leads") {
    const stage = String(record.fields.stage ?? "");
    if (stage === "won" || stage === "lost") return null;
    return (
      <PermissionGuard action="create" module={module}>
        <Button size="sm" onClick={() => run(() => convertLeadToOpportunity(record), "Opportunity created")}>
          Convert to opportunity
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLostOpen(true)}>
          Mark lost
        </Button>
        <ConfirmDialog
          open={lostOpen}
          onOpenChange={setLostOpen}
          title="Lost reason"
          description="Required: Price, Competitor, No budget, Timing, Spec mismatch, or Other."
          requireReason
          reasonLabel="Lost reason code"
          confirmLabel="Mark lost"
          tone="destructive"
          onConfirm={async (reason) => {
            await markLeadLost(record, reason ?? "");
            toast.success(`${record.code} marked lost`);
          }}
        />
      </PermissionGuard>
    );
  }

  if (entity === "quotations") {
    const disc = maxDiscountPct(record);
    return (
      <PermissionGuard action="create" module={module}>
        {disc > DISCOUNT_THRESHOLD_PCT && (
          <span className="self-center text-xs text-amber-700">Discount {disc}% &gt; {DISCOUNT_THRESHOLD_PCT}% threshold</span>
        )}
        <Button size="sm" variant="outline" onClick={() => run(() => reviseQuotation(record), "Revision created (original kept)")}>
          New revision
        </Button>
        {(["Email", "WhatsApp", "SMS"] as const).map((ch) => (
          <Button
            key={ch}
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await dispatchQuotation(record, ch);
                toast.success(`Simulated ${ch} send — tracking stored locally`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Send failed");
              }
            }}
          >
            Send {ch}
          </Button>
        ))}
        {(record.status === "approved" || record.status === "completed") && (
          <Button size="sm" onClick={() => run(() => convertQuotationToOrder(record), "Sales order created")}>
            Convert to SO
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "deliveries" && record.status === "completed") {
    return (
      <PermissionGuard action="create" module="sales">
        <Button size="sm" onClick={() => run(() => convertDeliveryToInvoice(record), "VAT invoice drafted")}>
          Create VAT invoice
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "sales_orders" && String(record.fields.packStatus) === "Packed" && String(record.fields.dispatchStatus) !== "Dispatched") {
    return (
      <PermissionGuard action="create" module="sales">
        <Button size="sm" onClick={() => run(() => convertOrderToDelivery(record), "Gate pass + challan created")}>
          Gate pass / challan
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "sales_returns") {
    return (
      <PermissionGuard action="create" module="sales">
        <Button size="sm" onClick={() => setNcrOpen(true)}>
          Credit note
        </Button>
        <ConfirmDialog
          open={ncrOpen}
          onOpenChange={setNcrOpen}
          title="Issue credit note"
          description="Adjusts AR and the VAT register when posted. Optionally raise an NCR for the quality team."
          confirmLabel="Credit note only"
          onConfirm={async () => {
            const { creditNote } = await convertReturnToCreditNote(record, false);
            toast.success(`${creditNote.code} drafted`);
            go(creditNote);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              const { creditNote, ncr } = await convertReturnToCreditNote(record, true);
              toast.success(`${creditNote.code} + ${ncr?.code ?? "NCR"} created`);
              go(creditNote);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            }
          }}
        >
          Credit note + NCR
        </Button>
      </PermissionGuard>
    );
  }

  return null;
}
