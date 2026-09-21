import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { PermissionGuard, fieldAccess } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { RecordHeader } from "@/components/records/RecordHeader";
import { FormSection, RecordField } from "@/components/records/FormSection";
import { LineItemTable } from "@/components/records/LineItemTable";
import { UnsavedChangesGuard } from "@/components/records/UnsavedChangesGuard";
import { isLocked } from "@/features/records/workflow";
import { getService } from "@/services/catalog";
import { makeLines, nextCode, useRecord } from "@/services/entityService";
import { docTotals } from "@/types/erp";
import type { LineItem } from "@/types/erp";

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

export function RecordFormPage({ mode }: { mode: "new" | "edit" }) {
  const params = useParams({ strict: false }) as { entity?: string; id?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const module = parsed?.module ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor(module, slug) ?? "";
  const def = getEntity(entity);
  const existing = useRecord(entity, code);
  const navigate = useNavigate();

  const initialFields = useMemo(() => {
    const fields: Record<string, unknown> = {};
    if (!def) return fields;
    for (const f of def.fields) {
      fields[f.key] = existing?.fields[f.key] ?? (f.type === "switch" ? false : f.type === "number" || f.type === "currency" ? 0 : "");
    }
    return fields;
    // existing is stable per code
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.key, existing?.id, mode]);

  const [fields, setFields] = useState<Record<string, unknown>>(initialFields);
  const [lines, setLines] = useState<LineItem[]>(() => {
    if (existing?.lines.length) return existing.lines;
    if (def?.lines) return makeLines(1);
    return [];
  });
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  useEffect(() => {
    setFields(initialFields);
    setLines(existing?.lines.length ? existing.lines : def?.lines ? makeLines(1) : []);
    setDirty(false);
  }, [existing?.id, mode, entity, initialFields, existing?.lines, def?.lines]);

  if (!def || !entity) {
    return <EmptyState title="Unknown record type" description={`${module}/${slug} is not mapped.`} />;
  }
  if (mode === "edit" && !existing) {
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
  if (mode === "edit" && existing && isLocked(existing.status)) {
    return (
      <EmptyState
        title="Record is locked"
        description={`${existing.code} is ${existing.status} and cannot be edited. Reverse or copy it instead.`}
        action={
          <Button asChild variant="outline">
            <Link to={recordPath(entity, existing.code) as never}>Open record</Link>
          </Button>
        }
      />
    );
  }

  const list = listPathFor(entity);
  const sections = groupFields(def);
  const titleField = def.titleField ?? def.fields.find((f) => f.key === "name" || f.key === "customerName" || f.key === "narration")?.key;
  const displayTitle =
    mode === "new" ? `New ${def.singular}` : existing?.title ?? def.singular;
  const displayCode = mode === "new" ? nextCode(entity) : existing?.code ?? code;

  const setField = (key: string, value: unknown) => {
    setDirty(true);
    setFields((s) => ({ ...s, [key]: value }));
  };

  const save = async () => {
    if (def.lines === "ledger") {
      const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
      if (Math.abs(debit - credit) >= 0.01) {
        toast.error("Ledger lines must balance before saving.");
        return;
      }
    }
    const required = def.fields.filter((f) => f.required);
    const missing = required.find((f) => {
      const access = fieldAccess(useAuthStore.getState().user?.role, entity, f.key);
      if (access === "hidden") return false;
      return fields[f.key] === "" || fields[f.key] == null;
    });
    if (missing) {
      toast.error(`${missing.label} is required`);
      return;
    }
    const svc = getService(entity);
    const title = String(fields[titleField ?? "name"] ?? fields.customerName ?? fields.narration ?? displayTitle);
    try {
      if (mode === "new") {
        const created = await svc.create({
          code: displayCode,
          title,
          fields,
          lines: def.lines ? lines : [],
        });
        toast.success(`${created.code} saved`);
        setDirty(false);
        navigate({ to: recordPath(entity, created.code) as never });
      } else if (existing) {
        const updated = await svc.update(existing.id, { title, fields, lines: def.lines ? lines : existing.lines });
        toast.success(`${updated.code} updated`);
        setDirty(false);
        navigate({ to: recordPath(entity, updated.code) as never });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const back = () => {
    const to = mode === "edit" && existing ? recordPath(entity, existing.code) : list;
    if (dirty) {
      setPendingTo(to);
      setDiscardOpen(true);
      return;
    }
    navigate({ to: to as never });
  };

  return (
    <PermissionGuard
      action={mode === "new" ? "create" : "edit"}
      module={module}
      fallback={<EmptyState title="You cannot edit this record" description="Your role does not include create/edit on this module." />}
    >
      <RecordHeader
        code={displayCode}
        title={displayTitle}
        status={existing?.status ?? def.statuses[0]}
        backTo={list}
        onBack={back}
        backLabel={def.label}
        subtitle={mode === "new" ? "Draft will stay in the local store until Django is connected." : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={back}>
              Cancel
            </Button>
            <Button size="sm" type="button" onClick={save}>
              Save
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {sections.map(([title, sectionFields]) => (
          <Card key={title} className="rounded-2xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormSection title={title}>
                {sectionFields.map((f) => (
                  <RecordField
                    key={f.key}
                    field={f}
                    value={fields[f.key]}
                    onChange={(v) => setField(f.key, v)}
                    entity={entity}
                  />
                ))}
              </FormSection>
            </CardContent>
          </Card>
        ))}

        {def.lines && (
          <Card className="rounded-2xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{def.lines === "ledger" ? "Ledger lines" : "Line items"}</CardTitle>
            </CardHeader>
            <CardContent>
              <LineItemTable
                lines={lines}
                onChange={(next) => {
                  setDirty(true);
                  setLines(next);
                }}
                mode={def.lines}
              />
              {def.lines === "items" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Totals: qty × rate − discount + VAT. Current {docTotals(lines).total.toLocaleString("en-IN")} NPR.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <UnsavedChangesGuard
        dirty={dirty}
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDirty(false);
          if (pendingTo) navigate({ to: pendingTo as never });
        }}
      />
    </PermissionGuard>
  );
}

export function RecordNewPage() {
  return <RecordFormPage mode="new" />;
}

export function RecordEditPage() {
  return <RecordFormPage mode="edit" />;
}
