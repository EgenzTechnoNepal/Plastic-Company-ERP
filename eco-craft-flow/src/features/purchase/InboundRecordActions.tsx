import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toastApiError } from "@/services/api/client";
import { receiveAgainstGate, inboundJourneyKey, useInboundJourney } from "@/services/api/inboundJourney";
import { runTypedWorkflowAction } from "@/services/api/m2Typed";
import { recordPath } from "@/features/registry/paths";
import { str } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

function backendStatus(record: ErpRecord) {
  return String(record.fields.serverStatus ?? record.status ?? "").toUpperCase();
}

function invalidateInbound(
  qc: ReturnType<typeof useQueryClient>,
  entity: string,
  recordId: string,
  poId?: string,
) {
  void qc.invalidateQueries({ queryKey: ["record", entity, recordId] });
  void qc.invalidateQueries({ queryKey: ["records", entity] });
  void qc.invalidateQueries({ queryKey: ["records", "gate_entries"] });
  void qc.invalidateQueries({ queryKey: ["records", "grns"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  void qc.invalidateQueries({ queryKey: ["audit-logs"] });
  if (poId) void qc.invalidateQueries({ queryKey: inboundJourneyKey(poId) });
}

function GateEntryLiveActions({ record }: { record: ErpRecord }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = backendStatus(record);
  const poId = str(record, "purchaseOrder");
  const journey = useInboundJourney(poId || undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const canSubmit = status === "DRAFT";
  const canCancel = status === "DRAFT" || status === "SUBMITTED";
  const canReceive = status === "SUBMITTED" && Boolean(poId);
  const receivable = useMemo(
    () => (journey.data?.purchase_order.lines ?? []).filter((line) => Number(line.remaining_receivable) > 0),
    [journey.data?.purchase_order.lines],
  );

  const submit = async () => {
    setBusy("submit");
    try {
      await runTypedWorkflowAction("gate_entries", record.id, "submitted");
      toast.success(`${record.code} submitted`);
      invalidateInbound(qc, "gate_entries", record.id, poId);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (reason?: string): Promise<boolean> => {
    setBusy("cancel");
    try {
      await runTypedWorkflowAction("gate_entries", record.id, "cancelled", reason);
      toast.success(`${record.code} cancelled`);
      invalidateInbound(qc, "gate_entries", record.id, poId);
      return true;
    } catch (err) {
      toastApiError(err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const receive = async () => {
    if (!receivable.length) return;
    setBusy("receive");
    try {
      const grn = await receiveAgainstGate(
        record.id,
        receivable.map((line) => ({
          purchase_order_line: line.id,
          accepted_quantity: line.remaining_receivable,
        })),
      );
      toast.success(`${grn.grn_number ?? "GRN"} created by backend`);
      invalidateInbound(qc, "gate_entries", record.id, poId);
      void qc.invalidateQueries({ queryKey: ["record", "grns", grn.id] });
      navigate({ to: recordPath("grns", grn.id) as never });
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Live Gate Entry Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {poId ? (
          <p className="text-muted-foreground">
            Receipts are created through the backend gate receive action for the linked Purchase Order.
          </p>
        ) : (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900">
            This gate entry is not linked to a Purchase Order, so the backend receive action is unavailable.
          </p>
        )}
        {canReceive && journey.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
            Could not load PO receipt lines: {journey.error instanceof Error ? journey.error.message : "Request failed"}
          </p>
        )}
        {canReceive && journey.isLoading && <p className="text-muted-foreground">Loading receivable PO lines…</p>}
        {canReceive && receivable.length > 0 && (
          <div className="rounded-lg border border-border/60 p-3">
            <p className="font-medium">Receive all remaining PO quantities</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {receivable.map((line) => (
                <li key={line.id}>
                  {line.item_sku} · {line.item_name}: {line.remaining_receivable} {line.uom}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <Button size="sm" onClick={submit} disabled={busy !== null}>
              {busy === "submit" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Submit Gate Entry
            </Button>
          )}
          {canReceive && (
            <Button size="sm" onClick={receive} disabled={busy !== null || journey.isLoading || !receivable.length}>
              {busy === "receive" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Receive into GRN
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy !== null}>
              Cancel Gate Entry
            </Button>
          )}
          {poId && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={recordPath("purchase_orders", poId) as never}>Open PO journey</Link>
            </Button>
          )}
        </div>
        {!canSubmit && !canReceive && !canCancel && (
          <p className="text-muted-foreground">No backend action is available for status {status || "unknown"}.</p>
        )}
      </CardContent>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel gate entry"
        description="The backend will validate whether this Gate Entry can be cancelled."
        confirmLabel="Cancel Gate Entry"
        tone="destructive"
        requireReason
        onConfirm={cancel}
      />
    </Card>
  );
}

function GrnLiveActions({ record }: { record: ErpRecord }) {
  const qc = useQueryClient();
  const status = backendStatus(record);
  const poRef = str(record, "purchaseReference");
  const [busy, setBusy] = useState(false);
  const canPost = status === "DRAFT";

  const post = async () => {
    setBusy(true);
    try {
      await runTypedWorkflowAction("grns", record.id, "posted");
      toast.success(`${record.code} posted`);
      invalidateInbound(qc, "grns", record.id);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Live GRN Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Posting is handled by the backend. The frontend does not update stock, lots, QC, PO receipt status, or inventory state.
        </p>
        {poRef && <p className="text-xs text-muted-foreground">Purchase reference: {poRef}</p>}
        {canPost ? (
          <Button size="sm" onClick={post} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Post GRN
          </Button>
        ) : (
          <p className="text-muted-foreground">No backend post action is available for status {status || "unknown"}.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function InboundRecordActions({ entity, record }: { entity: string; record: ErpRecord }) {
  if (entity === "gate_entries") return <GateEntryLiveActions record={record} />;
  if (entity === "grns") return <GrnLiveActions record={record} />;
  return null;
}
