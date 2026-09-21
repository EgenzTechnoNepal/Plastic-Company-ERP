import { useEffect, useState } from "react";
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
import { PurchaseCycleActions } from "@/features/purchase/CycleActions";
import { RfqCompare } from "@/features/purchase/RfqCompare";
import { ThreeWayMatchPanel } from "@/features/purchase/ThreeWayMatchPanel";
import { OcrPanel } from "@/features/purchase/OcrPanel";
import { Product360 } from "@/features/inventory/Product360";
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
import { getService } from "@/services/catalog";
import { logView, useApprovals, useAudit, useRecord } from "@/services/entityService";

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
  const audit = useAudit().filter((e) => e.recordId === record?.id || e.recordCode === code);
  const approvals = useApprovals().filter((a) => a.recordId === record?.id || a.recordCode === code);
  const [confirm, setConfirm] = useState<Extract<WorkflowAction, "reject" | "cancel" | "reverse" | "return"> | null>(null);

  useEffect(() => {
    if (record && entity && module) logView(module, entity, record.id, record.code);
  }, [record, entity, module]);

  if (!def || !entity) {
    return <EmptyState title="Unknown record type" description={`${module}/${slug} is not mapped.`} />;
  }
  if (!record) {
    return (
      <EmptyState
        title="Record not found"
        description={`${code} is not in the local store.`}
        action={
          <Button asChild variant="outline">
            <Link to={listPathFor(entity) as never}>Back to {def.label}</Link>
          </Button>
        }
      />
    );
  }

  const svc = getService(entity);
  const actions = workflowActions(record, def);
  const list = listPathFor(entity);

  const run = async (action: WorkflowAction, reason?: string) => {
    try {
      if (action === "submit") await svc.submit(record.id);
      if (action === "approve") await svc.approve(record.id);
      if (action === "reject") await svc.reject(record.id, reason ?? "Rejected");
      if (action === "return") await svc.returnToSender(record.id, reason ?? "Returned");
      if (action === "cancel") await svc.cancel(record.id, reason ?? "Cancelled");
      if (action === "post") await svc.post(record.id);
      if (action === "reverse") await svc.reverse(record.id, reason ?? "Reversed");
      const done: Record<WorkflowAction, string> = {
        submit: "submitted",
        approve: "approved",
        reject: "rejected",
        cancel: "cancelled",
        post: "posted",
        reverse: "reversed",
        edit: "updated",
        return: "returned",
      };
      toast.success(`${record.code} ${done[action]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const sections = groupFields(def);

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
                    <Link to={`${recordPath(entity, record.code)}/preview` as never}>Preview</Link>
                  </Button>
                )}
                <CycleActions entity={entity} record={record} module={module} />
                <PurchaseCycleActions entity={entity} record={record} module={module} />
                <WarehouseCycleActions entity={entity} record={record} module={module} />
                <ProductionCycleActions entity={entity} record={record} module={module} />
                <QualityCycleActions entity={entity} record={record} module={module} />
                {actions.includes("edit") && (
                  <PermissionGuard action="edit" module={module}>
                    <Button size="sm" variant="outline" className="gap-1.5" asChild>
                      <Link to={recordEditPath(entity, record.code) as never}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Link>
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("submit") && (
                  <PermissionGuard action="submit" module={module}>
                    <Button size="sm" onClick={() => run("submit")}>
                      Submit
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("approve") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" onClick={() => run("approve")}>
                      Approve
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("reject") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("reject")}>
                      Reject
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("return") && (
                  <PermissionGuard action="approve" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("return")}>
                      Return
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("post") && (
                  <PermissionGuard action="post" module={module}>
                    <Button size="sm" onClick={() => run("post")}>
                      Post
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("cancel") && (
                  <PermissionGuard action="cancel" module={module}>
                    <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")}>
                      Cancel
                    </Button>
                  </PermissionGuard>
                )}
                {actions.includes("reverse") && (
                  <PermissionGuard action="reverse" module={module}>
                    <Button size="sm" variant="destructive" onClick={() => setConfirm("reverse")}>
                      Reverse
                    </Button>
                  </PermissionGuard>
                )}
              </>
            }
          />
        }
        main={
          <>
            {sections.map(([title, fields]) => (
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
            {entity === "products" && <Product360 product={record} />}
            {entity === "tickets" && <SlaClock ticket={record} />}
            {entity === "sales_orders" && <FulfillmentPanel order={record} />}
            {entity === "rfqs" && <RfqCompare rfq={record} />}
            {entity === "purchase_bills" && <ThreeWayMatchPanel bill={record} />}
            {entity === "ocr_bills" && <OcrPanel scan={record} />}
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
            {entity === "qc_inspections" && <InspectionChecks qc={record} />}
            {entity === "quality_plans" && <PlanSpec plan={record} />}
            {entity === "capas" && <CapaPipeline capa={record} />}
            {entity === "suppliers" && <SupplierScorecard supplier={record} />}
            {def.lines && record.lines.length > 0 && (
              <Card className="rounded-2xl border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{def.lines === "ledger" ? "Ledger lines" : "Line items"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineItemTable lines={record.lines} onChange={() => undefined} mode={def.lines} readOnly />
                </CardContent>
              </Card>
            )}
            <DocumentPreview record={record} def={def} />
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
          if (confirm) await run(confirm, reason);
        }}
      />
    </>
  );
}
