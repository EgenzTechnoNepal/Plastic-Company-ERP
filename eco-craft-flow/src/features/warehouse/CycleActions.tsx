import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/lib/permissions";
import { str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { completeBinTransfer, dispatchTransfer, putAwayGrn, raiseCountAdjustment, receiveTransfer } from "@/features/warehouse/cycle";
import type { ErpRecord } from "@/types/erp";

export function WarehouseCycleActions({ entity, record }: { entity: string; record: ErpRecord; module: string }) {
  const navigate = useNavigate();
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

  if (entity === "grns" && str(record, "inspection") === "Passed" && str(record, "putawayStatus") !== "Put away") {
    return (
      <PermissionGuard action="create">
        <Button size="sm" onClick={() => run(() => putAwayGrn(record), "Put away to bin")}>
          Put away
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "stock_transfers") {
    const stage = str(record, "stage");
    return (
      <PermissionGuard action="edit">
        {stage !== "In Transit" && stage !== "Received" && (record.status === "approved" || record.status === "in_progress") && (
          <Button size="sm" onClick={() => run(() => dispatchTransfer(record), "Transfer dispatched — in transit")}>
            Dispatch transfer
          </Button>
        )}
        {stage === "In Transit" && (
          <Button size="sm" onClick={() => run(() => receiveTransfer(record), "Transfer received — stock updated")}>
            Receive transfer
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "bin_transfers" && record.status !== "completed") {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" onClick={() => run(() => completeBinTransfer(record), "Bin-to-bin completed")}>
          Complete bin move
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "stock_counts" && !str(record, "adjustment") && (numSafe(record) || record.lines.length > 0)) {
    return (
      <PermissionGuard action="create">
        <Button size="sm" onClick={() => run(() => raiseCountAdjustment(record), "Variance adjustment drafted")}>
          Raise variance
        </Button>
      </PermissionGuard>
    );
  }

  return null;
}

function numSafe(record: ErpRecord) {
  const v = record.fields.variances;
  return typeof v === "number" ? v > 0 : Number(v) > 0;
}
