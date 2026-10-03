import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EmptyState } from "@/components/common/EmptyState";
import { PermissionGuard, fieldAccess } from "@/lib/permissions";
import { useAuthStore, isLiveSession } from "@/store/auth";
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
import { productSkuPrefix, suggestProductSku } from "@/services/api/m2Typed";

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
  const isProductForm = entity === "products";

  const initialFields = useMemo(() => {
    const fields: Record<string, unknown> = {};
    if (!def) return fields;
    for (const f of def.fields) {
      fields[f.key] =
        existing?.fields[f.key] ?? (f.type === "switch" ? false : f.type === "number" || f.type === "currency" ? 0 : "");
    }
    if (isProductForm && mode === "new") {
      fields.type = fields.type || "Raw Material";
      fields.uom = fields.uom || "KG";
      fields.codeMode = "auto";
    }
    return fields;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.key, existing?.id, mode, isProductForm]);

  const [fields, setFields] = useState<Record<string, unknown>>(initialFields);
  const [lines, setLines] = useState<LineItem[]>(() => {
    if (existing?.lines.length) return existing.lines;
    if (def?.lines) return makeLines(1);
    return [];
  });
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [codeMode, setCodeMode] = useState<"auto" | "manual">("auto");
  const [manualCode, setManualCode] = useState("");
  const [autoCode, setAutoCode] = useState(() =>
    nextCode("products", productSkuPrefix(String(initialFields.type || "Raw Material"))),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields(initialFields);
    setLines(existing?.lines.length ? existing.lines : def?.lines ? makeLines(1) : []);
    setDirty(false);
    if (mode === "new" && isProductForm) {
      setCodeMode("auto");
      setManualCode("");
    }
  }, [existing?.id, mode, entity, initialFields, existing?.lines, def?.lines, isProductForm]);

  useEffect(() => {
    if (!isProductForm || mode !== "new" || codeMode !== "auto") return;
    const productType = String(fields.type || "Raw Material");
    let cancelled = false;
    (async () => {
      if (isLiveSession()) {
        try {
          const suggested = await suggestProductSku(productType);
          if (!cancelled) setAutoCode(suggested);
          return;
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) setAutoCode(nextCode("products", productSkuPrefix(productType)));
    })();
    return () => {
      cancelled = true;
    };
  }, [isProductForm, mode, codeMode, fields.type]);

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
  const titleField =
    def.titleField ?? def.fields.find((f) => f.key === "name" || f.key === "customerName" || f.key === "narration")?.key;
  const displayTitle = mode === "new" ? `New ${def.singular}` : existing?.title ?? def.singular;
  const resolvedProductCode =
    isProductForm && mode === "new"
      ? codeMode === "manual"
        ? manualCode.trim().toUpperCase()
        : autoCode
      : mode === "new"
        ? nextCode(entity)
        : (existing?.code ?? code);
  const displayCode = resolvedProductCode || (mode === "new" ? "—" : code);

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
    if (isProductForm && mode === "new" && codeMode === "manual" && !manualCode.trim()) {
      toast.error("Enter a product code, or switch to Auto-generate.");
      return;
    }
    const svc = getService(entity);
    const title = String(fields[titleField ?? "name"] ?? fields.customerName ?? fields.narration ?? displayTitle);
    setSaving(true);
    try {
      if (mode === "new") {
        const created = await svc.create({
          code: isProductForm ? resolvedProductCode : displayCode === "—" ? nextCode(entity) : displayCode,
          title,
          fields: isProductForm ? { ...fields, codeMode, sku: resolvedProductCode } : fields,
          lines: def.lines ? lines : [],
        });
        toast.success(`${created.code} saved`);
        setDirty(false);
        navigate({ to: recordPath(entity, created.code) as never });
      } else if (existing) {
        const updated = await svc.update(existing.id, {
          title,
          fields,
          lines: def.lines ? lines : existing.lines,
        });
        toast.success(`${updated.code} updated`);
        setDirty(false);
        navigate({ to: recordPath(entity, updated.code) as never });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
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
      fallback={
        <EmptyState
          title="You cannot edit this record"
          description="Your role does not include create/edit on this module."
        />
      }
    >
      <RecordHeader
        code={displayCode}
        title={displayTitle}
        status={existing?.status ?? def.statuses[0]}
        backTo={list}
        onBack={back}
        backLabel={def.label}
        subtitle={
          isProductForm && mode === "new"
            ? codeMode === "auto"
              ? "Product code will be generated by the system from the product type."
              : "Enter your own product / SKU code."
            : mode === "new"
              ? "New record"
              : undefined
        }
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={back} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {isProductForm && mode === "new" && (
          <Card className="rounded-2xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Product code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={codeMode}
                onValueChange={(v) => {
                  setDirty(true);
                  setCodeMode(v as "auto" | "manual");
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem value="auto" id="code-auto" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Auto-generate</p>
                    <p className="text-xs text-muted-foreground">
                      System assigns the next code (e.g. RM-001, FG-001) from product type.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem value="manual" id="code-manual" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Enter manually</p>
                    <p className="text-xs text-muted-foreground">Use your own SKU / item code.</p>
                  </div>
                </label>
              </RadioGroup>

              <div className="space-y-1.5">
                <Label htmlFor="product-code">{codeMode === "auto" ? "Generated code" : "Product code"}</Label>
                {codeMode === "auto" ? (
                  <Input id="product-code" value={autoCode} readOnly className="bg-muted/40 font-mono" />
                ) : (
                  <Input
                    id="product-code"
                    value={manualCode}
                    onChange={(e) => {
                      setDirty(true);
                      setManualCode(e.target.value.toUpperCase());
                    }}
                    placeholder="e.g. RM-PLA-001"
                    className="font-mono"
                    autoComplete="off"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
