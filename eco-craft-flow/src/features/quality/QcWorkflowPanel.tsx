import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [busy, setBusy] = useState(false);
  const [coa, setCoa] = useState(String(record.fields?.coaReference ?? ""));
  const [coaUrl, setCoaUrl] = useState(String(record.fields?.coaAttachmentUrl ?? ""));
  const [remarks, setRemarks] = useState(String(record.fields?.remarks ?? ""));
  const [disposeNote, setDisposeNote] = useState("");
  const [lastDispose, setLastDispose] = useState<DisposeResult | null>(null);
  const status = String(record.status ?? "").toLowerCase();
  const failed = status === "failed";
  const done = status === "passed" || status === "failed";

  const run = async (fn: () => Promise<QCInspectionDto>, okMsg: string) => {
    setBusy(true);
    try {
      const dto = await fn();
      toast.success(okMsg);
      onUpdated?.(mapDto(dto, record));
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
          CoA → Pass / Fail → then manager Return or Scrap (stock write-off)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {record.fields?.ncrReference ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            NCR: {String(record.fields.ncrReference)}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>CoA reference</Label>
            <Input value={coa} onChange={(e) => setCoa(e.target.value)} disabled={busy || done} />
          </div>
          <div className="space-y-1">
            <Label>CoA attachment URL</Label>
            <Input value={coaUrl} onChange={(e) => setCoaUrl(e.target.value)} disabled={busy || done} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={busy || done} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            disabled={busy || done}
            onClick={() =>
              run(
                () =>
                  qcPassInspection(id, {
                    coa_reference: coa,
                    ...(coaUrl.trim() ? { coa_attachment_url: coaUrl.trim() } : {}),
                    remarks,
                  }),
                "QC Pass — lot Available",
              )
            }
          >
            Pass
          </Button>
          <Button
            size="sm"
            type="button"
            variant="destructive"
            disabled={busy || done}
            onClick={() => run(() => qcFailInspection(id, "QUARANTINED"), "QC Fail — Quarantine + NCR")}
          >
            Fail → Quarantine
          </Button>
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
