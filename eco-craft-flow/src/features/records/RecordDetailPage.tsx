import { useEffect, useRef, useState } from "react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PermissionGuard } from "@/lib/permissions";
import { entityKeyFor, listPathFor, parseRecordLocation, recordEditPath, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { RecordDetailLayout, RecordHeader } from "@/components/records/RecordHeader";
import { FormSection, RecordField } from "@/components/records/FormSection";
import { LineItemTable } from "@/components/records/LineItemTable";
import { WorkflowTimeline, AuditTimeline, RelatedRecords } from "@/components/records/Timelines";
import { ApprovalPanel } from "@/components/records/ApprovalPanel";
import { DocumentPreview } from "@/components/records/DocumentPreview";
import { workflowActions, type WorkflowAction } from "@/features/records/workflow";
import { Customer360 } from "@/features/crm/Customer360";
import { SlaClock } from "@/features/crm/SlaClock";
import { CycleActions } from "@/features/sales/CycleActions";
import { FulfillmentPanel } from "@/features/sales/FulfillmentPanel";
import { SalesWorkflowPanel } from "@/features/sales/SalesWorkflowPanel";
import { SalesDocumentActions } from "@/features/sales/SalesDocumentActions";
import { PurchaseCycleActions } from "@/features/purchase/CycleActions";
import { RfqCompare } from "@/features/purchase/RfqCompare";
import { ThreeWayMatchPanel } from "@/features/purchase/ThreeWayMatchPanel";
import { OcrPanel } from "@/features/purchase/OcrPanel";
import { Product360 } from "@/features/inventory/Product360";
import { LandedCostPanel } from "@/features/inventory/LandedCostPanel";
import { InventoryLotPanel } from "@/features/inventory/InventoryLotPanel";
import { WarehouseCycleActions } from "@/features/warehouse/CycleActions";
import { ProductionCycleActions } from "@/features/production/CycleActions";
import { BomExplosion } from "@/features/production/BomExplosion";
import { PlanPanel } from "@/features/production/PlanPanel";
import { MrpPanel } from "@/features/production/MrpPanel";
import { ShopFloor } from "@/features/production/ShopFloor";
import { CostingPanel } from "@/features/production/CostingPanel";
import { GanttBoard } from "@/features/production/GanttBoard";
import { BatchGenealogy } from "@/features/production/Genealogy";
import { QualityCycleActions } from "@/features/quality/CycleActions";
import { InspectionChecks } from "@/features/quality/InspectionChecks";
import { PlanSpec } from "@/features/quality/PlanSpec";
import { CapaPipeline } from "@/features/quality/CapaPipeline";
import { SupplierScorecard } from "@/features/quality/SupplierScorecard";
import { LcWorkflowPanel } from "@/features/purchase/LcWorkflowPanel";
import { LcGateGuardBanner } from "@/features/purchase/LcGateGuardBanner";
import { InboundJourneyPanel } from "@/features/purchase/InboundJourneyPanel";
import { InboundRecordActions } from "@/features/purchase/InboundRecordActions";
import { QcWorkflowPanel } from "@/features/quality/QcWorkflowPanel";
import { getService } from "@/services/catalog";
import { isLiveSession } from "@/store/auth";
import {
  isTypedEntity,
  LIVE_TYPED_EDIT_ENTITIES,
  M2_DEMO_TYPED_ENTITIES,
  M2_TYPED_DETAIL_ENTITIES,
} from "@/services/api/typedEntities";
import { hasTypedWorkflowAction } from "@/services/api/m2Typed";
import { logView, useApprovals, useAudit, useRecord, useRecords, useRecordsStatus } from "@/services/entityService";
import type { DocStatus } from "@/types/erp";

function groupFields(def: NonNullable<ReturnType<typeof getEntity>>) {
  const groups = new Map<string, typeof def.fields>();
  for (const f of def.fields) {
    const key = f.section ?? "Details";
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  return Array.from(groups.entries());
}

function GrnQcLinks({ grnId }: { grnId: string }) {
  const inspections = useRecords("qc_inspections", { grn: grnId });
  const status = useRecordsStatus("qc_inspections", undefined, { grn: grnId });
  if (status.loading) {
    return (
      <Card className="rounded-2xl border-border/60">
        <CardContent className="py-3 text-sm text-muted-foreground">Loading related QC inspections...</CardContent>
      </Card>
    );
  }
  if (status.error || inspections.length === 0) return null;
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Related QC</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {inspections.map((inspection) => (
          <Button key={inspection.id} asChild variant="outline" size="sm" className="mr-2">
            <Link to={recordPath("qc_inspections", inspection.id) as never}>
              {inspection.code} - {String(inspection.fields.lotStatus ?? inspection.status)}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function RecordDetailPage() {
  const params = useParams({ strict: false }) as { entity?: string; id?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const module = parsed?.module ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor(module, slug) ?? "";
  const def = getEntity(entity);
  const record = useRecord(entity, code);
  const loadStatus = useRecordsStatus(entity, code);
  const audit = useAudit().filter((e) => e.recordId === record?.id || e.recordCode === code);
  const approvals = useApprovals().filter((a) => a.recordId === record?.id || a.recordCode === code);
  const [confirm, setConfirm] = useState<Extract<WorkflowAction, "reject" | "cancel" | "reverse" | "return"> | null>(null);
  const [pendingAction, setPendingAction] = useState<WorkflowAction | null>(null);
  const actionPending = useRef(false);

  useEffect(() => {
    if (record && entity && module) logView(module, entity, record.id, record.code);
  }, [record, entity, module]);

  if (!def || !entity) {
    return <EmptyState title="Unknown record type" description={`${module}/${slug} is not mapped.`} />;
  }
  if (!record && loadStatus.loading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading {code}…</p>;
  }
  if (!record) {
    return (
      <EmptyState
        title={loadStatus.error ? "Could not load record" : "Record not found"}
        description={
          loadStatus.error
            ? `${code}: ${loadStatus.error}`
            : isLiveSession()
              ? `${code} was not found on the server for your company.`
              : `${code} is not in the local store.`
        }
        action={
          <Button asChild variant="outline">
            <Link to={listPathFor(entity) as never}>Back to {def.label}</Link>
          </Button>
        }
      />
    );
  }

  const svc = getService(entity);
  const liveInboundActions = isLiveSession() && (entity === "gate_entries" || entity === "grns");
  const liveSalesDocActions = isLiveSession() && isTypedEntity(entity) && (entity === "deliveries" || entity === "invoices");
  const actionTargets: Partial<Record<WorkflowAction, DocStatus>> = {
    submit: "submitted",
    approve: "approved",
    reject: "rejected",
    return: "returned",
    cancel: "cancelled",
    post: "posted",
    reverse: "reversed",
    start: "in_progress",
    complete: "completed",
    close: "closed",
  };
  const actions = liveInboundActions || liveSalesDocActions
    ? []
    : workflowActions(record, def).filter((action) => {
        if (!isLiveSession() || !M2_DEMO_TYPED_ENTITIES.has(entity)) return true;
        if (action === "edit") return LIVE_TYPED_EDIT_ENTITIES.has(entity);
        const target = actionTargets[action];
        return target !== undefined && hasTypedWorkflowAction(entity, target);
      });
  // Browser-side cycle panels read and write the offline store; typed records are server-authoritative.
  const localPanels = !(isLiveSession() && isTypedEntity(entity));
  const inboundPoId =
    !localPanels && entity === "purchase_orders" ? String(record.fields.typedPurchaseOrderId ?? "") : "";
  const list = listPathFor(entity);

  const run = async (action: WorkflowAction, reason?: string): Promise<boolean> => {
    if (actionPending.current) return false;
    actionPending.current = true;
    setPendingAction(action);
    try {
      if (action === "submit") await svc.submit(record.id);
      if (action === "approve") await svc.approve(record.id);
      if (action === "reject") await svc.reject(record.id, reason ?? "Rejected");
      if (action === "return") await svc.returnToSender(record.id, reason ?? "Returned");
      if (action === "cancel") await svc.cancel(record.id, reason ?? "Cancelled");
      if (action === "post") await svc.post(record.id);
      if (action === "reverse") await svc.reverse(record.id, reason ?? "Reversed");
      if (action === "start") await svc.transition(record.id, "in_progress", "Started");
      if (action === "complete") await svc.transition(record.id, "completed", "Marked complete");
      if (action === "close") await svc.transition(record.id, "closed", "Closed");
      const done: Record<WorkflowAction, string> = {
        submit: "submitted",
        approve: "approved",
        reject: "rejected",
        cancel: "cancelled",
        post: "posted",
        reverse: "reversed",
        edit: "updated",
        return: "returned",
        start: "started",
        complete: "completed",
        close: "closed",
      };
      toast.success(`${record.code} ${done[action]}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return false;
    } finally {
      actionPending.current = false;
      setPendingAction(null);
    }
  };

  const sections = groupFields(def);
  const detailRef = M2_TYPED_DETAIL_ENTITIES.has(entity) ? record.id : record.code;

  return (
    <>
      <RecordDetailLayout
        header={
          <RecordHeader
            code={record.code}
            title={record.title}
            status={record.status}
            backTo={list}
            backLabel={def.label}
            subtitle={def.moduleLabel}
            actions={
              <>
                {def.printable && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`${recordPath(entity, detailRef)}/preview` as never}>Preview</Link>
                  </Button>
                )}
                {localPanels && (
                  <>
                    <CycleActions entity={entity} record={record} module={module} />
                    <PurchaseCycleActions entity={entity} record={record} module={module} />
                    <WarehouseCycleActions entity={entity} record={record} module={module} />
                    <ProductionCycleActions entity={entity} record={record} module={module} />
                    <QualityCycleActions entity={entity} record={record} module={module} />
                  </>
                )}
                {actions.includes("edit") && !inboundPoId && (
                  <PermissionGuard action="edit" module={module}>
                    <Button size="sm" variant="outline" className="gap-1.5" asChild>
                      <Link to={recordEditPath(entity, detailRef) as never}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Link>
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("submit") && (
                  <PermissionGuard action="submit" module={module}>
                    <Button size="sm" onClick={() => void run("submit")} disabled={pendingAction !== null}>
                      {pendingAction === "submit" ? "Submitting…" : "Submit"}
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("approve") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" onClick={() => void run("approve")} disabled={pendingAction !== null}>
                      {pendingAction === "approve" ? "Approving…" : "Approve"}
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("reject") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("reject")} disabled={pendingAction !== null}>
                      Reject
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("return") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("return")} disabled={pendingAction !== null}>
                      Return
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("post") && (
                  <PermissionGuard action="post" module={module}>
                    <Button size="sm" onClick={() => void run("post")} disabled={pendingAction !== null}>
                      {pendingAction === "post" ? "Posting…" : "Post"}
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("cancel") && (
                  <PermissionGuard action="cancel" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")} disabled={pendingAction !== null}>
                      Cancel
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("reverse") && (
                  <PermissionGuard action="reverse" module={module}>
                    <Button size="sm" variant="destructive" onClick={() => setConfirm("reverse")} disabled={pendingAction !== null}>
                      Reverse
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("start") && (
                  <PermissionGuard action="edit" module={module}>
                    <Button size="sm" onClick={() => void run("start")} disabled={pendingAction !== null}>
                      {pendingAction === "start" ? "Starting…" : "Start"}
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("complete") && (
                  <PermissionGuard action="edit" module={module}>
                    <Button size="sm" onClick={() => void run("complete")} disabled={pendingAction !== null}>
                      {pendingAction === "complete" ? "Completing…" : "Mark Complete"}
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("close") && (
                  <PermissionGuard action="edit" module={module}>
                    <Button size="sm" variant="outline" onClick={() => void run("close")} disabled={pendingAction !== null}>
                      {pendingAction === "close" ? "Closing…" : "Close"}
                    </Button>
                  </PermissionGuard>
                )}
              </>
            }
          />
        }
        main={
          <>
            {inboundPoId && <InboundJourneyPanel purchaseOrderId={inboundPoId} />}
            {liveInboundActions && <InboundRecordActions entity={entity} record={record} />}
            {!inboundPoId && sections.map(([title, fields]) => (
              <Card key={title} className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormSection title={title}>
                    {fields.map((f) => (
                      <RecordField key={f.key} field={f} value={record.fields[f.key]} onChange={() => undefined} readOnly entity={entity} />
                    ))}
                  </FormSection>
                </CardContent>
              </Card>
            ))}
            {entity === "customers" && <Customer360 customer={record} />}
            {localPanels && entity === "products" && <Product360 product={record} />}
            {entity === "landed_cost_documents" && <LandedCostPanel record={record} />}
            {entity === "inventory_lots" && <InventoryLotPanel record={record} />}
            {entity === "tickets" && <SlaClock ticket={record} />}
            {localPanels && entity === "sales_orders" && <FulfillmentPanel order={record} />}
            {!localPanels && entity === "sales_orders" && <SalesWorkflowPanel order={record} />}
            {liveSalesDocActions && <SalesDocumentActions entity={entity} record={record} />}
            {entity === "rfqs" && <RfqCompare rfq={record} />}
            {localPanels && entity === "purchase_bills" && <ThreeWayMatchPanel bill={record} />}
            {entity === "ocr_bills" && <OcrPanel scan={record} />}
            {(entity === "gate_entries" || entity === "grns") && <LcGateGuardBanner record={record} />}
            {entity === "grns" && <GrnQcLinks grnId={record.id} />}
            {entity === "letters_of_credit" && <LcWorkflowPanel record={record} />}
            {entity === "boms" && <BomExplosion bom={record} />}
            {entity === "production_plans" && <PlanPanel plan={record} />}
            {entity === "mrp_runs" && <MrpPanel run={record} />}
            {entity === "work_orders" && (
              <>
                <ShopFloor wo={record} />
                <CostingPanel wo={record} />
              </>
            )}
            {entity === "machine_schedules" && <GanttBoard schedule={record} />}
            {entity === "batches" && <BatchGenealogy batch={record} />}
            {entity === "qc_inspections" && (
              <>
                <QcWorkflowPanel
                  record={record}
                />
                {localPanels && <InspectionChecks qc={record} />}
              </>
            )}
            {entity === "quality_plans" && <PlanSpec plan={record} />}
            {entity === "capas" && <CapaPipeline capa={record} />}
            {localPanels && entity === "suppliers" && <SupplierScorecard supplier={record} />}
            {!inboundPoId && def.lines && record.lines.length > 0 && (
              <Card className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{def.lines === "ledger" ? "Ledger lines" : "Line items"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineItemTable lines={record.lines} onChange={() => undefined} mode={def.lines} readOnly />
                </CardContent>
              </Card>
            )}
            {!inboundPoId && <DocumentPreview record={record} def={def} />}
          </>
        }
        sidebar={
          <>
            <WorkflowTimeline events={record.history} />
            <ApprovalPanel requests={approvals} />
            <RelatedRecords links={record.links} />
            <AuditTimeline events={audit} />
          </>
        }
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "reject" ? "Reject document" : confirm === "cancel" ? "Cancel document" : confirm === "return" ? "Return for information" : "Reverse posting"}
        description="This is recorded on the audit trail. A reason is required."
        requireReason
        confirmLabel={confirm === "reject" ? "Reject" : confirm === "cancel" ? "Cancel document" : confirm === "return" ? "Return" : "Reverse"}
        tone="destructive"
        onConfirm={async (reason) => {
          if (!confirm) return false;
          return run(confirm, reason);
        }}
      />
    </>
  );
}
