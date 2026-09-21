import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/lib/permissions";
import { str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import {
  advanceCapa,
  closeCapa,
  completeInspection,
  issueCoa,
  raiseCapaFromNcr,
  raiseNcrFrom,
  recordCalibration,
  releaseQuarantine,
} from "@/features/quality/cycle";
import type { ErpRecord } from "@/types/erp";

export function QualityCycleActions({ entity, record }: { entity: string; record: ErpRecord; module: string }) {
  const navigate = useNavigate();
  const go = (next: ErpRecord) => navigate({ to: recordPath(next.entity, next.code) as never });

  const run = async (fn: () => Promise<ErpRecord>, ok: string, stay = false) => {
    try {
      const next = await fn();
      toast.success(ok);
      if (!stay) go(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (entity === "qc_inspections") {
    return (
      <PermissionGuard action="edit">
        {(record.status === "draft" || record.status === "submitted") && (
          <>
            <Button size="sm" onClick={() => run(() => completeInspection(record, "Pass"), "Inspection passed", true)}>
              Complete — pass
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => completeInspection(record, "Fail"), "Inspection failed — held", true)}>
              Complete — fail
            </Button>
          </>
        )}
        {(record.status === "hold" || str(record, "result") === "Fail") && !str(record, "ncr") && (
          <Button size="sm" onClick={() => run(() => raiseNcrFrom(record), "NCR raised")}>
            Raise NCR
          </Button>
        )}
        {str(record, "result") === "Pass" && record.status === "approved" && !str(record, "coa") && (
          <Button size="sm" variant="outline" onClick={() => run(() => issueCoa(record), "CoA issued")}>
            Issue CoA
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "quarantine" && record.status === "hold") {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" onClick={() => run(() => releaseQuarantine(record), "Hold released", true)}>
          Release hold
        </Button>
        {!str(record, "ncr") && (
          <Button size="sm" variant="outline" onClick={() => run(() => raiseNcrFrom(record), "NCR raised")}>
            Raise NCR
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "ncrs") {
    return (
      <PermissionGuard action="edit">
        {!str(record, "capa") && record.status !== "closed" && record.status !== "cancelled" && (
          <Button size="sm" onClick={() => run(() => raiseCapaFromNcr(record), "CAPA opened")}>
            Raise CAPA
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "capas" && record.status !== "closed" && record.status !== "completed") {
    return (
      <PermissionGuard action="edit">
        {str(record, "stage") !== "Closure" && str(record, "stage") !== "Effectiveness" && (
          <Button size="sm" onClick={() => run(() => advanceCapa(record), "CAPA advanced", true)}>
            Next stage
          </Button>
        )}
        {str(record, "stage") !== "Containment" && (
          <Button size="sm" onClick={() => run(() => closeCapa(record), "CAPA closed — effective", true)}>
            Verify & close
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "instruments") {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" onClick={() => run(() => recordCalibration(record), "Calibration recorded", true)}>
          Record calibration
        </Button>
      </PermissionGuard>
    );
  }

  return null;
}
