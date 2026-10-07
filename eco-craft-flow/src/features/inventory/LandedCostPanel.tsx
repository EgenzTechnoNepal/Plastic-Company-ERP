import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, Plus, Save, Send, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastApiError } from "@/services/api/client";
import { isLiveSession } from "@/store/auth";
import {
  createTypedLandedCostComponent,
  deleteTypedLandedCostComponent,
  listTypedLandedCostComponents,
  postTypedLandedCost,
  previewTypedLandedCost,
  updateTypedLandedCostComponent,
  type LandedCostComponentPayload,
  type LandedCostPreviewDto,
} from "@/services/api/m2Typed";
import type { ErpRecord } from "@/types/erp";

type CostComponent = {
  id?: string;
  category?: string;
  label?: string;
  description?: string;
  amount?: string;
  currency?: string | null;
  exchange_rate?: string;
  base_currency_amount?: string;
  allocation_basis?: string;
};

type CostAllocation = {
  id?: string;
  component?: string;
  lot?: string | null;
  item?: string | null;
  allocation_basis?: string;
  basis_value?: string;
  allocated_amount?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Material / Purchase Cost",
  INTERNATIONAL_FREIGHT: "Freight",
  SHIPPING: "Freight",
  INSURANCE: "Insurance",
  CUSTOMS_DUTY: "Customs",
  CUSTOMS_TAX: "Customs",
  VAT: "Customs",
  CLEARING: "Clearing",
  PORT_HANDLING: "Clearing",
  NEPAL_TRANSPORT: "Local Transport",
  LOCAL_HANDLING: "Local Transport",
  BANK_CHARGES: "Other Costs",
  OTHER_DIRECT_COST: "Other Costs",
};

const COMPONENT_CATEGORIES = [
  ["INTERNATIONAL_FREIGHT", "Freight - International Freight"],
  ["SHIPPING", "Freight - Shipping"],
  ["INSURANCE", "Insurance"],
  ["CUSTOMS_DUTY", "Customs - Duty"],
  ["CUSTOMS_TAX", "Customs - Tax"],
  ["VAT", "Customs - VAT"],
  ["CLEARING", "Clearing"],
  ["PORT_HANDLING", "Clearing - Port Handling"],
  ["NEPAL_TRANSPORT", "Local Transport - Nepal Transport"],
  ["LOCAL_HANDLING", "Local Transport - Local Handling"],
  ["BANK_CHARGES", "Other Costs - Bank Charges"],
  ["OTHER_DIRECT_COST", "Other Costs - Other Direct Cost"],
] as const;

const ALLOCATION_BASES = ["QUANTITY", "WEIGHT", "VALUE", "VOLUME", "EQUAL", "MANUAL"] as const;

type ComponentForm = {
  category: string;
  description: string;
  amount: string;
  currency: string;
  exchange_rate: string;
  source_document: string;
  source_document_number: string;
  tax_amount: string;
  cost_date: string;
  allocation_basis: string;
  notes: string;
};

function asComponents(value: unknown): CostComponent[] {
  return Array.isArray(value) ? (value as CostComponent[]) : [];
}

function asAllocations(value: unknown): CostAllocation[] {
  return Array.isArray(value) ? (value as CostAllocation[]) : [];
}

function labelFor(category?: string, fallback?: string) {
  return CATEGORY_LABELS[String(category ?? "").toUpperCase()] ?? fallback ?? String(category ?? "Cost");
}

function money(value: unknown, currency: string) {
  if (value == null || value === "") return "Not returned";
  const n = Number(value);
  const text = Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
  return `${currency} ${text}`.trim();
}

function qty(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(value ?? "");
}

function formFromComponent(component: CostComponent, currency: string): ComponentForm {
  return {
    category: component.category || "INTERNATIONAL_FREIGHT",
    description: component.description || "",
    amount: component.amount || "",
    currency: String(component.currency || currency),
    exchange_rate: component.exchange_rate || "1",
    source_document: "",
    source_document_number: "",
    tax_amount: "0",
    cost_date: "",
    allocation_basis: component.allocation_basis || "VALUE",
    notes: "",
  };
}

function payloadFromForm(form: ComponentForm, document: string): LandedCostComponentPayload {
  return {
    document,
    category: form.category,
    description: form.description,
    amount: form.amount,
    currency: form.currency,
    exchange_rate: form.exchange_rate || "1",
    source_document: form.source_document,
    source_document_number: form.source_document_number,
    tax_amount: form.tax_amount || "0",
    cost_date: form.cost_date || null,
    allocation_basis: form.allocation_basis || "VALUE",
    notes: form.notes,
  };
}

export function LandedCostPanel({ record }: { record: ErpRecord }) {
  const qc = useQueryClient();
  const id = String(record.fields.typedId ?? record.id);
  const currencyId = String(record.fields.currency ?? "");
  const currency = String(record.fields.currencyCode ?? record.fields.currency ?? "");
  const fallbackComponents = asComponents(record.fields.components);
  const allocations = asAllocations(record.fields.allocations);
  const status = String(record.fields.serverStatus ?? record.status).toUpperCase();
  const [preview, setPreview] = useState<LandedCostPreviewDto | null>(null);
  const [busy, setBusy] = useState<"preview" | "post" | "component" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ComponentForm>>({});
  const [newRow, setNewRow] = useState<ComponentForm>(() => ({
    category: "INTERNATIONAL_FREIGHT",
    description: "",
    amount: "",
    currency: currencyId,
    exchange_rate: "1",
    source_document: "",
    source_document_number: "",
    tax_amount: "0",
    cost_date: "",
    allocation_basis: "VALUE",
    notes: "",
  }));

  const componentQuery = useQuery({
    queryKey: ["landed-cost-components", id],
    queryFn: () => listTypedLandedCostComponents(id),
    enabled: Boolean(id),
  });
  const liveSession = isLiveSession();
  const displayedComponents =
    liveSession && componentQuery.error
      ? []
      : componentQuery.data ?? (liveSession ? [] : fallbackComponents);
  const canEditComponents = status !== "POSTED" && status !== "CANCELLED";

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["record", "landed_cost_documents", id] });
    void qc.invalidateQueries({ queryKey: ["record", "landed_cost_documents", record.code] });
    void qc.invalidateQueries({ queryKey: ["records", "landed_cost_documents"] });
    void qc.invalidateQueries({ queryKey: ["landed-cost-components", id] });
    void qc.invalidateQueries({ queryKey: ["records", "stock_movements"] });
    void qc.invalidateQueries({ queryKey: ["records", "products"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  };

  const refreshAfterComponentChange = () => {
    setPreview(null);
    refresh();
  };

  const runPreview = async () => {
    setBusy("preview");
    try {
      const result = await previewTypedLandedCost(id);
      setPreview(result);
      refresh();
      toast.success("Backend landed cost totals refreshed");
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const runPost = async () => {
    setBusy("post");
    try {
      const result = await postTypedLandedCost(id);
      setPreview(result);
      refresh();
      toast.success("Landed cost posted");
      return true;
    } catch (err) {
      toastApiError(err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveNewComponent = async () => {
    setBusy("component");
    try {
      await createTypedLandedCostComponent(payloadFromForm(newRow, id));
      setNewRow((prev) => ({ ...prev, description: "", amount: "", source_document: "", source_document_number: "", tax_amount: "0", cost_date: "", notes: "" }));
      refreshAfterComponentChange();
      toast.success("Landed cost component saved");
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const saveComponent = async (component: CostComponent) => {
    if (!component.id) return;
    const form = drafts[component.id] ?? formFromComponent(component, currencyId);
    setBusy("component");
    try {
      await updateTypedLandedCostComponent(component.id, payloadFromForm(form, id));
      refreshAfterComponentChange();
      toast.success("Landed cost component updated");
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const removeComponent = async () => {
    if (!deleteId) return false;
    setBusy("component");
    try {
      await deleteTypedLandedCostComponent(deleteId);
      setDeleteId(null);
      refreshAfterComponentChange();
      toast.success("Landed cost component removed");
      return true;
    } catch (err) {
      toastApiError(err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const purchaseValue = preview?.purchase_value ?? record.fields.purchaseValue;
  const total = preview?.landed_total;
  const unit = preview?.landed_unit_cost;
  const previewComponents = preview?.components ?? [];
  const displayComponents: CostComponent[] = previewComponents.length
    ? previewComponents.map((component): CostComponent => ({
        id: component.id,
        category: component.category,
        label: labelFor(component.category),
        amount: component.amount,
        currency: component.currency,
        exchange_rate: component.exchange_rate,
        base_currency_amount: component.base_currency_amount,
        allocation_basis: component.allocation_basis,
      }))
    : displayedComponents;
  const previewIsStale = preview === null && displayedComponents.length > 0 && status !== "POSTED";

  const renderEditorRow = (key: string, form: ComponentForm, onChange: (next: ComponentForm) => void, action: React.ReactNode) => (
    <div key={key} className="grid gap-2 rounded-lg border border-border/60 p-3 lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.7fr_auto]">
      <div className="space-y-1">
        <Label>Category</Label>
        <Select value={form.category} onValueChange={(category) => onChange({ ...form, category })} disabled={!canEditComponents || busy !== null}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPONENT_CATEGORIES.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Amount</Label>
        <Input inputMode="decimal" value={form.amount} onChange={(e) => onChange({ ...form, amount: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Currency</Label>
        <Input value={form.currency} onChange={(e) => onChange({ ...form, currency: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>FX</Label>
        <Input inputMode="decimal" value={form.exchange_rate} onChange={(e) => onChange({ ...form, exchange_rate: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="flex items-end gap-1">
        {action}
      </div>
      <div className="space-y-1">
        <Label>Reference Type</Label>
        <Input value={form.source_document} onChange={(e) => onChange({ ...form, source_document: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Reference No.</Label>
        <Input value={form.source_document_number} onChange={(e) => onChange({ ...form, source_document_number: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Tax Amount</Label>
        <Input inputMode="decimal" value={form.tax_amount} onChange={(e) => onChange({ ...form, tax_amount: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Cost Date</Label>
        <Input type="date" value={form.cost_date} onChange={(e) => onChange({ ...form, cost_date: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
      <div className="space-y-1">
        <Label>Allocation</Label>
        <Select value={form.allocation_basis} onValueChange={(allocation_basis) => onChange({ ...form, allocation_basis })} disabled={!canEditComponents || busy !== null}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALLOCATION_BASES.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 lg:col-span-1">
        <Label>Notes</Label>
        <Input value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} disabled={!canEditComponents || busy !== null} />
      </div>
    </div>
  );

  return (
    <>
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Additional Costs</CardTitle>
          <p className="text-xs text-muted-foreground">
            Components are saved to Django as landed cost component rows. Backend categories are preserved.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {componentQuery.isLoading && (
            <p role="status" className="text-sm text-muted-foreground">Loading backend cost components…</p>
          )}
          {componentQuery.error && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <span>Could not load landed-cost components: {componentQuery.error instanceof Error ? componentQuery.error.message : "Request failed"}</span>
              <Button size="sm" variant="outline" onClick={() => void componentQuery.refetch()}>Retry</Button>
            </div>
          )}
          {!canEditComponents && (
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Component editing is disabled for {status} landed cost documents.
            </p>
          )}
          {displayedComponents.map((component) => {
            if (!component.id) return null;
            const form = drafts[component.id] ?? formFromComponent(component, currencyId);
            return renderEditorRow(
              component.id,
              form,
              (next) => setDrafts((prev) => ({ ...prev, [component.id as string]: next })),
              <>
                <Button size="icon" variant="outline" onClick={() => saveComponent(component)} disabled={!canEditComponents || busy !== null || !form.amount || !form.currency}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => setDeleteId(component.id ?? null)} disabled={!canEditComponents || busy !== null}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>,
            );
          })}
          {canEditComponents && renderEditorRow(
            "new-component",
            newRow,
            setNewRow,
            <Button size="icon" onClick={saveNewComponent} disabled={busy !== null || !newRow.amount || !newRow.currency}>
              <Plus className="h-4 w-4" />
            </Button>,
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Landed Cost Breakdown</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={runPreview} disabled={busy !== null || status === "POSTED"}>
                <Calculator className="mr-1.5 h-4 w-4" /> Preview
              </Button>
              <Button size="sm" onClick={() => setPostOpen(true)} disabled={busy !== null || status === "POSTED" || status === "CANCELLED"}>
                <Send className="mr-1.5 h-4 w-4" /> Post
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Totals and landed unit cost are returned by the Django landed cost service.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
        {previewIsStale && (
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Run Preview to refresh backend totals after component changes.
          </p>
        )}
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Material / Purchase Cost</TableCell>
              <TableCell className="text-right">{money(purchaseValue, currency)}</TableCell>
            </TableRow>
            {displayComponents.length ? (
              displayComponents.map((component, index) => (
                <TableRow key={component.id ?? `${component.category}-${index}`}>
                  <TableCell>
                    {labelFor(component.category, component.label)}
                    {component.description ? <span className="ml-2 text-muted-foreground">{component.description}</span> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(component.base_currency_amount ?? component.amount, currency)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  No landed cost components returned by backend.
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="font-semibold">Total Landed Cost</TableCell>
              <TableCell className="text-right font-semibold">{money(total, currency)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold">Landed Cost / Unit</TableCell>
              <TableCell className="text-right font-semibold">{money(unit, currency)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Purchase Quantity</p>
            <p className="font-medium">{qty(preview?.purchase_quantity ?? record.fields.purchaseQuantity)}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Purchase Unit Cost</p>
            <p className="font-medium">{money(preview?.purchase_unit_cost ?? record.fields.purchaseUnitCost, currency)}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Additional Costs Total</p>
            <p className="font-medium">{money(preview?.additional_costs_total, currency)}</p>
          </div>
        </div>

        {allocations.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Allocation</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead className="text-right">Basis Value</TableHead>
                  <TableHead className="text-right">Allocated Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{allocation.item ?? "-"}</TableCell>
                    <TableCell>{allocation.lot ?? "-"}</TableCell>
                    <TableCell>{allocation.allocation_basis ?? "-"}</TableCell>
                    <TableCell className="text-right">{qty(allocation.basis_value)}</TableCell>
                    <TableCell className="text-right">{money(allocation.allocated_amount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove landed cost component"
        description="This calls the Django component DELETE endpoint. The component will be removed from active landed cost totals."
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={removeComponent}
      />
      <ConfirmDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        title="Post landed cost"
        description="The Django landed-cost service will post this document and apply its backend-calculated costs."
        confirmLabel="Post landed cost"
        onConfirm={runPost}
      />
    </>
  );
}
