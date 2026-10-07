import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ErpRecord } from "@/types/erp";
import {
  qcDisposeInspection,
  qcFailInspection,
  qcPassInspection,
  type DisposeResult,
  type QCInspectionDto,
} from "@/services/api/phase2";

function mapDto(dto: QCInspectionDto, prev: ErpRecord): ErpRecord {
  return {
    ...prev,
    status: (dto.status as ErpRecord["status"]) ?? prev.status,
    fields: {
      ...prev.fields,
      coaReference: dto.coa_reference ?? prev.fields.coaReference,
      coaAttachmentUrl: dto.coa_attachment_url ?? prev.fields.coaAttachmentUrl,
      metrics: dto.metrics ?? prev.fields.metrics,
      ncrReference: dto.ncr_reference ?? prev.fields.ncrReference,
      disposition: dto.fail_disposition ?? prev.fields.disposition,
      remarks: dto.remarks ?? prev.fields.remarks,
      serverStatus: dto.status ?? prev.fields.serverStatus,
      typedId: dto.id,
    },
  };
}

/** Phase 3 Incoming QC + Wave 2 Return/Scrap disposition. */
export function QcWorkflowPanel({
  record,
  onUpdated,
}: {
  record: ErpRecord;
  onUpdated?: (next: ErpRecord) => void;
}) {
  const id = String(record.fields?.typedId ?? record.id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [coa, setCoa] = useState(String(record.fields?.coaReference ?? ""));
  const [coaUrl, setCoaUrl] = useState(String(record.fields?.coaAttachmentUrl ?? ""));
  const [remarks, setRemarks] = useState(String(record.fields?.remarks ?? ""));
  const [failDisposition, setFailDisposition] = useState("QUARANTINED");
  const [disposeNote, setDisposeNote] = useState("");
  const [lastDispose, setLastDispose] = useState<DisposeResult | null>(null);
  const status = String(record.fields?.serverStatus ?? record.status ?? "").toUpperCase();
  const lotStatus = String(record.fields?.lotStatus ?? "");
  const failed = status === "FAILED";
  const canInspect = status === "DRAFT" && lotStatus === "QC_HOLD";

  const stateMessage =
    lotStatus === "QC_HOLD"
      ? "Received - QC Hold - Not Available for Allocation"
      : lotStatus === "AVAILABLE"
        ? "QC Passed - Available"
        : lotStatus === "QUARANTINED"
          ? "QC Failed - Quarantined"
          : lotStatus === "REJECTED"
            ? "QC Failed - Rejected"
            : lotStatus || "Backend lot state unavailable";

  const refresh = (next: ErpRecord) => {
    void qc.invalidateQueries({ queryKey: ["record", "qc_inspections", id] });
    void qc.invalidateQueries({ queryKey: ["record", "qc_inspections", record.code] });
    void qc.invalidateQueries({ queryKey: ["records", "qc_inspections"] });
    void qc.invalidateQueries({ queryKey: ["records", "grns"] });
    void qc.invalidateQueries({ queryKey: ["records", "batches"] });
    void qc.invalidateQueries({ queryKey: ["records", "products"] });
    void qc.invalidateQueries({ queryKey: ["records", "stock_movements"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    void qc.invalidateQueries({ queryKey: ["audit-logs"] });
    onUpdated?.(next);
  };

  const run = async (fn: () => Promise<QCInspectionDto>, okMsg: string) => {
    setBusy(true);
    try {
      const dto = await fn();
      toast.success(okMsg);
      refresh(mapDto(dto, record));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "QC action failed");
    } finally {
      setBusy(false);
    }
  };

  const dispose = async (action: "RETURN" | "SCRAP") => {
    setBusy(true);
    try {
      const result = await qcDisposeInspection(id, action, disposeNote);
      setLastDispose(result);
      toast.success(
        action === "RETURN"
          ? `Return ${result.purchase_return ?? ""} + Debit ${result.debit_note ?? ""}`
          : `Scrapped — wrote off ${result.qty_written_off ?? ""}`,
      );
      onUpdated?.({
        ...record,
        fields: {
          ...record.fields,
          disposeAction: action,
          purchaseReturn: result.purchase_return,
          debitNote: result.debit_note,
        },
      });
      void qc.invalidateQueries({ queryKey: ["record", "qc_inspections", id] });
      void qc.invalidateQueries({ queryKey: ["records", "qc_inspections"] });
      void qc.invalidateQueries({ queryKey: ["records", "grns"] });
      void qc.invalidateQueries({ queryKey: ["records", "stock_movements"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispose failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Incoming QC (Phase 3 + Wave 2)</CardTitle>
        <p className="text-xs text-muted-foreground">
          GRN receipt creates QC hold stock. Only backend QC Pass releases the lot to Available.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium">{stateMessage}</p>
          <p className="text-xs text-muted-foreground">
            Inspection {status || "UNKNOWN"} · Lot {record.fields?.lotNumber ? String(record.fields.lotNumber) : String(record.fields?.lot ?? "—")}
            {record.fields?.warehouse ? ` · Warehouse ${String(record.fields.warehouse)}` : ""}
            {record.fields?.bin ? ` · Bin ${String(record.fields.bin)}` : ""}
          </p>
        </div>
        {record.fields?.ncrReference ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            NCR: {String(record.fields.ncrReference)}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>CoA reference</Label>
            <Input value={coa} onChange={(e) => setCoa(e.target.value)} disabled={busy || !canInspect} />
          </div>
          <div className="space-y-1">
            <Label>CoA attachment URL</Label>
            <Input value={coaUrl} onChange={(e) => setCoaUrl(e.target.value)} disabled={busy || !canInspect} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={busy || !canInspect} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            disabled={busy || !canInspect}
            onClick={() =>
              run(
                () =>
                  qcPassInspection(id, {
                    coa_reference: coa,
                    ...(coaUrl.trim() ? { coa_attachment_url: coaUrl.trim() } : {}),
                    remarks,
                  }),
                "QC Pass - lot released by backend",
              )
            }
          >
            Pass
          </Button>
          <div className="flex items-center gap-2">
            <Select value={failDisposition} onValueChange={setFailDisposition} disabled={busy || !canInspect}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Fail disposition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QUARANTINED">Quarantine</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              type="button"
              variant="destructive"
              disabled={busy || !canInspect}
              onClick={() => run(() => qcFailInspection(id, failDisposition), `QC Fail - ${failDisposition.toLowerCase()}`)}
            >
              Fail
            </Button>
          </div>
        </div>

        {failed ? (
          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-sm font-medium">Manager disposition (Wave 2)</p>
            <div className="space-y-1">
              <Label>Disposition note</Label>
              <Input
                value={disposeNote}
                onChange={(e) => setDisposeNote(e.target.value)}
                disabled={busy || Boolean(lastDispose)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                disabled={busy || Boolean(lastDispose)}
                onClick={() => dispose("RETURN")}
              >
                Return to vendor (PRT + DBN)
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={busy || Boolean(lastDispose)}
                onClick={() => dispose("SCRAP")}
              >
                Scrap / write-off
              </Button>
            </div>
            {lastDispose ? (
              <p className="text-xs text-muted-foreground">
                {lastDispose.action}: qty {lastDispose.qty_written_off}
                {lastDispose.purchase_return ? ` · ${lastDispose.purchase_return}` : ""}
                {lastDispose.debit_note ? ` · ${lastDispose.debit_note}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
