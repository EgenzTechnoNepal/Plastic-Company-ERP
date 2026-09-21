import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/lib/permissions";
import { str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import {
  closeWorkOrder,
  completeOperation,
  issueMaterials,
  pauseOperation,
  receiveFgBatch,
  releaseWorkOrder,
  replanPlan,
  rollBomCost,
  runMrp,
  startOperation,
  startOperationFor,
} from "@/features/production/cycle";
import type { ErpRecord } from "@/types/erp";

export function ProductionCycleActions({ entity, record }: { entity: string; record: ErpRecord; module: string }) {
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

  if (entity === "boms") {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" variant="outline" asChild>
          <Link to={`${recordPath("boms", record.code)}/explosion` as never}>Explosion</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => run(() => rollBomCost(record), "Rolled cost updated", true)}>
          Roll cost
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "production_plans" && (record.status === "approved" || record.status === "completed")) {
    return (
      <PermissionGuard action="edit">
        <Button size="sm" onClick={() => run(() => runMrp(record), "MRP run completed")}>
          Run MRP
        </Button>
        <Button size="sm" variant="outline" onClick={() => run(() => replanPlan(record), "Re-plan drafted")}>
          Re-plan
        </Button>
      </PermissionGuard>
    );
  }

  if (entity === "work_orders") {
    return (
      <PermissionGuard action="edit">
        {record.status === "draft" && (
          <Button size="sm" onClick={() => run(() => releaseWorkOrder(record), "Work order released", true)}>
            Release
          </Button>
        )}
        {(record.status === "released" || record.status === "in_progress") && (
          <>
            <Button size="sm" onClick={() => run(() => issueMaterials(record, "Manual"), "Material issued")}>
              Issue material
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => issueMaterials(record, "Backflush"), "Backflush issued")}>
              Backflush
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(() => startOperation(record), "Operation started", true)}>
              Start operation
            </Button>
            <Button size="sm" onClick={() => run(() => receiveFgBatch(record), "FG batch received")}>
              Receive FG
            </Button>
          </>
        )}
        {record.status === "completed" && (
          <Button size="sm" onClick={() => run(() => closeWorkOrder(record), "Work order closed", true)}>
            Close costing
          </Button>
        )}
      </PermissionGuard>
    );
  }

  if (entity === "operations") {
    return (
      <PermissionGuard action="edit">
        {(record.status === "draft" || record.status === "hold") && (
          <Button
            size="sm"
            onClick={() => run(() => startOperationFor(str(record, "workOrder")), record.status === "hold" ? "Operation resumed" : "Operation started", true)}
          >
            {record.status === "hold" ? "Resume" : "Start"}
          </Button>
        )}
        {record.status === "in_progress" && (
          <>
            <Button size="sm" variant="outline" onClick={() => run(() => pauseOperation(record, "Breakdown"), "Operation paused", true)}>
              Pause
            </Button>
            <Button size="sm" onClick={() => run(() => completeOperation(record), "Operation completed", true)}>
              Complete
            </Button>
          </>
        )}
      </PermissionGuard>
    );
  }

  return null;
}
