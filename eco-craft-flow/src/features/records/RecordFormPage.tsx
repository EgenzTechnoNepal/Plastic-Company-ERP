import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/common/EmptyState";
import { PermissionGuard, fieldAccess } from "@/lib/permissions";
import { useAuthStore, isLiveSession } from "@/store/auth";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { RecordHeader } from "@/components/records/RecordHeader";
import { FormSection, RecordField } from "@/components/records/FormSection";
import { LineItemTable } from "@/components/records/LineItemTable";
import { UnsavedChangesGuard } from "@/components/records/UnsavedChangesGuard";
import { EntitySelector, WarehouseSelector } from "@/components/records/EntitySelector";
import { isLocked } from "@/features/records/workflow";
import { getService } from "@/services/catalog";
import { makeLines, newLineId, nextCode, useRecord, useRecords, useRecordsStatus } from "@/services/entityService";
import { docTotals } from "@/types/erp";
import type { LineItem } from "@/types/erp";
import { ApiError } from "@/services/api/client";
import { M2_TYPED_DETAIL_ENTITIES } from "@/services/api/typedEntities";
import { listTypedCurrencies, listTypedIncoterms, listTypedUoms, productSkuPrefix, suggestProductSku } from "@/services/api/m2Typed";

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

function errorText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((v) => errorText(v) ?? String(v)).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${errorText(v) ?? String(v)}`)
      .join(" ");
  }
  return String(value);
}

function fieldError(errors: Record<string, string>, ...keys: string[]) {
  return keys.map((key) => errors[key]).find(Boolean);
}

function formErrorFrom(err: unknown): { message: string; fields: Record<string, string> } {
  if (err instanceof ApiError) {
    const fields = Object.fromEntries(
      Object.entries(err.fields ?? {}).map(([key, value]) => [key, errorText(value) ?? err.message]),
    );
    return { message: errorText(err.fields?.non_field_errors) ?? err.message, fields };
  }
  return { message: err instanceof Error ? err.message : "Save failed", fields: {} };
}

function validatePurchaseOrder(fields: Record<string, unknown>, lines: LineItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fields.supplier ?? "").trim()) errors.supplier = "Supplier is required.";
  if (!lines.length) errors.lines = "Add at least one purchase order line.";
  lines.forEach((line, index) => {
    const missing: string[] = [];
    if (!String(line.item ?? "").trim()) missing.push("item");
    if (!line.uom) missing.push("UOM");
    if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) missing.push("quantity greater than zero");
    if (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0) missing.push("unit price zero or greater");
    if (missing.length) errors[`lines.${index}`] = `Line ${index + 1}: ${missing.join(", ")} required.`;
  });
  return errors;
}

function validateSalesOrder(fields: Record<string, unknown>, lines: LineItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fields.customer ?? "").trim()) errors.customer = "Customer is required.";
  if (!lines.length) errors.lines = "Add at least one sales order line.";
  lines.forEach((line, index) => {
    const missing: string[] = [];
    if (!String(line.item ?? "").trim()) missing.push("item");
    if (!String(line.uom ?? "").trim()) missing.push("UOM");
    if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) missing.push("quantity greater than zero");
    if (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0) missing.push("unit price zero or greater");
    if (missing.length) errors[`lines.${index}`] = `Line ${index + 1}: ${missing.join(", ")} required.`;
  });
  return errors;
}

function validateDispatch(fields: Record<string, unknown>, lines: LineItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fields.salesOrder ?? "").trim()) errors.salesOrder = "Sales Order is required.";
  if (!lines.length) errors.lines = "Add at least one dispatch line.";
  lines.forEach((line, index) => {
    if (!String(line.salesOrderLineId || line.item || "").trim()) errors[`lines.${index}`] = `Line ${index + 1}: Sales Order line is required.`;
    if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) errors[`lines.${index}.quantity`] = `Line ${index + 1}: quantity must be greater than zero.`;
    if (!String(line.uom ?? "").trim()) errors[`lines.${index}.uom`] = `Line ${index + 1}: UOM is required.`;
  });
  return errors;
}

function validateInvoice(fields: Record<string, unknown>, lines: LineItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fields.customer ?? "").trim()) errors.customer = "Customer is required.";
  if (!String(fields.delivery ?? fields.dispatchNote ?? "").trim()) errors.delivery = "Posted Dispatch is required before invoicing.";
  if (!lines.length) errors.lines = "Add at least one invoice line.";
  lines.forEach((line, index) => {
    if (!String(line.item ?? "").trim()) errors[`lines.${index}.item`] = `Line ${index + 1}: item is required.`;
    if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) errors[`lines.${index}.quantity`] = `Line ${index + 1}: quantity must be greater than zero.`;
    if (!String(line.uom ?? "").trim()) errors[`lines.${index}.uom`] = `Line ${index + 1}: UOM is required.`;
    if (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0) errors[`lines.${index}.rate`] = `Line ${index + 1}: unit price must be zero or greater.`;
  });
  return errors;
}

function PurchaseOrderFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const currencies = useQuery({ queryKey: ["typed-options", "currencies"], queryFn: listTypedCurrencies, staleTime: 5 * 60_000 });
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Purchase order</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Header">
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Supplier<span className="ml-0.5 text-destructive">*</span></Label>
            <EntitySelector entity="suppliers" id="po-supplier" value={String(fields.supplier ?? "")} onChange={(v) => onChange("supplier", v)} disabled={disabled} />
            {errors.supplier && <p className="text-xs font-medium text-destructive">{errors.supplier}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-delivery">Expected delivery</Label>
            <Input id="po-delivery" type="date" value={String(fields.deliveryDate ?? "")} onChange={(e) => onChange("deliveryDate", e.target.value)} disabled={disabled} />
            {(errors.expected_delivery_date || errors.deliveryDate) && <p className="text-xs font-medium text-destructive">{errors.expected_delivery_date ?? errors.deliveryDate}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-currency">Currency</Label>
            <Select value={String(fields.currency ?? "") || undefined} onValueChange={(v) => onChange("currency", v)} disabled={disabled || currencies.isLoading}>
              <SelectTrigger id="po-currency">
                <SelectValue placeholder={currencies.isLoading ? "Loading currencies..." : "Select currency..."} />
              </SelectTrigger>
              <SelectContent>
                {(currencies.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.currency && <p className="text-xs font-medium text-destructive">{errors.currency}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-exchange-rate">Exchange rate</Label>
            <Input id="po-exchange-rate" type="number" min="0" step="0.000001" value={String(fields.exchangeRate ?? 1)} onChange={(e) => onChange("exchangeRate", e.target.value)} disabled={disabled} />
            {errors.exchange_rate && <p className="text-xs font-medium text-destructive">{errors.exchange_rate}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-warehouse">Destination warehouse</Label>
            <WarehouseSelector id="po-warehouse" value={String(fields.destinationWarehouse ?? "")} onChange={(v) => onChange("destinationWarehouse", v)} disabled={disabled} />
            {errors.destination_warehouse && <p className="text-xs font-medium text-destructive">{errors.destination_warehouse}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-payment-terms">Payment terms</Label>
            <Input id="po-payment-terms" value={String(fields.paymentTerms ?? "")} onChange={(e) => onChange("paymentTerms", e.target.value)} disabled={disabled} />
            {errors.payment_terms && <p className="text-xs font-medium text-destructive">{errors.payment_terms}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-named-place">Named place</Label>
            <Input id="po-named-place" value={String(fields.namedPlace ?? "")} onChange={(e) => onChange("namedPlace", e.target.value)} disabled={disabled} />
            {errors.named_place && <p className="text-xs font-medium text-destructive">{errors.named_place}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

function PurchaseOrderLineEditor({
  lines,
  onChange,
  errors,
  disabled,
}: {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const products = useRecords("products");
  const warehouses = useRecords("warehouses");
  const uoms = useQuery({ queryKey: ["typed-options", "uoms"], queryFn: listTypedUoms, staleTime: 5 * 60_000 });
  const update = (id: string, next: Partial<LineItem>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...next } : l)));
  const add = () => onChange([...lines, { id: newLineId(), item: "", description: "", uom: "", warehouse: "", qty: 1, rate: 0, discountPct: 0, taxPct: 0 }]);
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Purchase order lines</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errors.lines && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{errors.lines}</p>}
        {lines.map((line, index) => (
          <div key={line.id} className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Item<span className="ml-0.5 text-destructive">*</span></Label>
              <Select value={line.item || undefined} onValueChange={(v) => update(line.id, { item: v })} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.code}>{p.code} - {p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>UOM<span className="ml-0.5 text-destructive">*</span></Label>
              <Select value={line.uom || undefined} onValueChange={(v) => update(line.id, { uom: v })} disabled={disabled || uoms.isLoading}>
                <SelectTrigger><SelectValue placeholder={uoms.isLoading ? "Loading..." : "Select UOM..."} /></SelectTrigger>
                <SelectContent>
                  {(uoms.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.code}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={line.warehouse || undefined} onValueChange={(v) => update(line.id, { warehouse: v })} disabled={disabled}>
                <SelectTrigger><SelectValue placeholder="Use header" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.code}>{w.code} - {w.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordered quantity<span className="ml-0.5 text-destructive">*</span></Label>
              <Input type="number" min="0" step="0.001" value={line.qty} onChange={(e) => update(line.id, { qty: Number(e.target.value) || 0 })} disabled={disabled} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit price</Label>
              <Input type="number" min="0" step="0.01" value={line.rate} onChange={(e) => update(line.id, { rate: Number(e.target.value) || 0 })} disabled={disabled} />
            </div>
            <div className="space-y-1.5">
              <Label>Discount %</Label>
              <Input type="number" min="0" step="0.01" value={line.discountPct ?? 0} onChange={(e) => update(line.id, { discountPct: Number(e.target.value) || 0 })} disabled={disabled} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax %</Label>
              <Input type="number" min="0" step="0.01" value={line.taxPct ?? 0} onChange={(e) => update(line.id, { taxPct: Number(e.target.value) || 0 })} disabled={disabled} />
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <Label>Line notes</Label>
              <Input value={line.description ?? ""} onChange={(e) => update(line.id, { description: e.target.value })} disabled={disabled} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(lines.filter((l) => l.id !== line.id))} disabled={disabled || lines.length <= 1}>
                Remove
              </Button>
            </div>
            {errors[`lines.${index}`] && <p className="text-xs font-medium text-destructive sm:col-span-2 lg:col-span-4">{errors[`lines.${index}`]}</p>}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>Add line</Button>
          <p className="text-sm font-medium">Total {docTotals(lines).total.toLocaleString("en-IN")} NPR</p>
        </div>
      </CardContent>
    </Card>
  );
}

function validateShipment(fields: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fields.shipmentNumber ?? "").trim()) errors.shipmentNumber = "Shipment number is required.";
  if (!String(fields.supplier ?? "").trim()) errors.supplier = "Supplier is required.";
  return errors;
}

function ShipmentFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const suppliers = useRecords("suppliers");
  const purchaseOrders = useRecords("purchase_orders");
  const incoterms = useQuery({ queryKey: ["typed-options", "incoterms"], queryFn: listTypedIncoterms, staleTime: 5 * 60_000 });
  const selectedPo = purchaseOrders.find((po) => po.id === fields.purchaseOrder || po.code === fields.purchaseOrder);

  const setPurchaseOrder = (value: string) => {
    onChange("purchaseOrder", value);
    const po = purchaseOrders.find((row) => row.id === value);
    if (po?.fields.supplier) onChange("supplier", po.fields.supplier);
    if (po?.code) onChange("purchaseReference", po.code);
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Shipment</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Shipment">
          <div className="space-y-1.5">
            <Label htmlFor="shipment-number">Shipment number<span className="ml-0.5 text-destructive">*</span></Label>
            <Input id="shipment-number" value={String(fields.shipmentNumber ?? "")} onChange={(e) => onChange("shipmentNumber", e.target.value)} disabled={disabled} />
            {(errors.shipmentNumber || errors.shipment_number) && <p className="text-xs font-medium text-destructive">{errors.shipmentNumber ?? errors.shipment_number}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-po">Purchase Order</Label>
            <Select value={String(fields.purchaseOrder ?? "") || undefined} onValueChange={setPurchaseOrder} disabled={disabled}>
              <SelectTrigger id="shipment-po">
                <SelectValue placeholder="Select PO..." />
              </SelectTrigger>
              <SelectContent>
                {purchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.code} - {po.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.purchase_order && <p className="text-xs font-medium text-destructive">{errors.purchase_order}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-supplier">Supplier<span className="ml-0.5 text-destructive">*</span></Label>
            <Select value={String(fields.supplier ?? "") || undefined} onValueChange={(v) => onChange("supplier", v)} disabled={disabled}>
              <SelectTrigger id="shipment-supplier">
                <SelectValue placeholder="Select supplier..." />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPo?.fields.supplierName && (
              <p className="text-xs text-muted-foreground">PO supplier: {String(selectedPo.fields.supplierName)}</p>
            )}
            {(errors.supplier || errors.supplier_id) && <p className="text-xs font-medium text-destructive">{errors.supplier ?? errors.supplier_id}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-ref">Purchase reference</Label>
            <Input id="shipment-ref" value={String(fields.purchaseReference ?? "")} onChange={(e) => onChange("purchaseReference", e.target.value)} disabled={disabled} />
            {errors.purchase_reference && <p className="text-xs font-medium text-destructive">{errors.purchase_reference}</p>}
          </div>
        </FormSection>
        <FormSection title="Logistics">
          <div className="space-y-1.5">
            <Label htmlFor="shipment-incoterm">Incoterm</Label>
            <Select value={String(fields.incoterm ?? "") || undefined} onValueChange={(v) => onChange("incoterm", v)} disabled={disabled || incoterms.isLoading}>
              <SelectTrigger id="shipment-incoterm">
                <SelectValue placeholder={incoterms.isLoading ? "Loading incoterms..." : "Select incoterm..."} />
              </SelectTrigger>
              <SelectContent>
                {(incoterms.data ?? []).map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.incoterm && <p className="text-xs font-medium text-destructive">{errors.incoterm}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-place">Named place</Label>
            <Input id="shipment-place" value={String(fields.namedPlace ?? "")} onChange={(e) => onChange("namedPlace", e.target.value)} disabled={disabled} />
            {errors.named_place && <p className="text-xs font-medium text-destructive">{errors.named_place}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-etd">ETD</Label>
            <Input id="shipment-etd" type="date" value={String(fields.etd ?? "")} onChange={(e) => onChange("etd", e.target.value)} disabled={disabled} />
            {errors.etd && <p className="text-xs font-medium text-destructive">{errors.etd}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipment-eta">ETA</Label>
            <Input id="shipment-eta" type="date" value={String(fields.eta ?? "")} onChange={(e) => onChange("eta", e.target.value)} disabled={disabled} />
            {errors.eta && <p className="text-xs font-medium text-destructive">{errors.eta}</p>}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
            <Label htmlFor="shipment-active">Active</Label>
            <Switch id="shipment-active" checked={fields.isActive !== false} onCheckedChange={(v) => onChange("isActive", v)} disabled={disabled} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="shipment-notes">Notes</Label>
            <Textarea id="shipment-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

function BackendRecordSelect({
  entity,
  value,
  onChange,
  disabled,
  placeholder,
  id,
}: {
  entity: string;
  value: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  id: string;
}) {
  const rows = useRecords(entity);
  return (
    <Select value={String(value ?? "") || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {row.code} - {row.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SalesDispatchFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Dispatch</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Dispatch">
          <div className="space-y-1.5">
            <Label htmlFor="dispatch-so">Sales Order<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="dispatch-so" entity="sales_orders" value={fields.salesOrder} onChange={(v) => onChange("salesOrder", v)} disabled={disabled} placeholder="Select Sales Order..." />
            {errors.salesOrder && <p className="text-xs font-medium text-destructive">{errors.salesOrder}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dispatch-warehouse">Warehouse</Label>
            <BackendRecordSelect id="dispatch-warehouse" entity="warehouses" value={fields.warehouse} onChange={(v) => onChange("warehouse", v)} disabled={disabled} placeholder="Select warehouse..." />
            {errors.warehouse && <p className="text-xs font-medium text-destructive">{errors.warehouse}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dispatch-notes">Notes</Label>
            <Textarea id="dispatch-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

function SalesInvoiceFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sales invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Sales invoice">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-customer">Customer<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="invoice-customer" entity="customers" value={fields.customer} onChange={(v) => onChange("customer", v)} disabled={disabled} placeholder="Select customer..." />
            {errors.customer && <p className="text-xs font-medium text-destructive">{errors.customer}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-so">Sales Order</Label>
            <BackendRecordSelect id="invoice-so" entity="sales_orders" value={fields.salesOrder} onChange={(v) => onChange("salesOrder", v)} disabled={disabled} placeholder="Select Sales Order..." />
            {errors.salesOrder && <p className="text-xs font-medium text-destructive">{errors.salesOrder}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-dispatch">Dispatch<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="invoice-dispatch" entity="deliveries" value={fields.delivery ?? fields.dispatchNote} onChange={(v) => { onChange("delivery", v); onChange("dispatchNote", v); }} disabled={disabled} placeholder="Select posted dispatch..." />
            {errors.delivery && <p className="text-xs font-medium text-destructive">{errors.delivery}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-currency">Currency</Label>
            <Select value={String(fields.currency ?? "") || undefined} onValueChange={(v) => onChange("currency", v)} disabled={disabled}>
              <SelectTrigger id="invoice-currency">
                <SelectValue placeholder="Select currency..." />
              </SelectTrigger>
              <SelectContent>
                {["NPR", "USD"].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.currency && <p className="text-xs font-medium text-destructive">{errors.currency}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-date">Invoice Date</Label>
            <Input id="invoice-date" type="date" value={String(fields.invoiceDate ?? "")} onChange={(e) => onChange("invoiceDate", e.target.value)} disabled={disabled} />
            {errors.invoiceDate && <p className="text-xs font-medium text-destructive">{errors.invoiceDate}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-due">Due Date</Label>
            <Input id="invoice-due" type="date" value={String(fields.dueDate ?? "")} onChange={(e) => onChange("dueDate", e.target.value)} disabled={disabled} />
            {errors.dueDate && <p className="text-xs font-medium text-destructive">{errors.dueDate}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea id="invoice-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

function SalesBackendLineEditor({
  entity,
  lines,
  onChange,
  errors,
  disabled,
}: {
  entity: string;
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const isDispatch = entity === "deliveries";
  const patchLine = (id: string, next: Partial<LineItem>) => onChange(lines.map((line) => line.id === id ? { ...line, ...next } : line));
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{isDispatch ? "Dispatch lines" : "Invoice lines"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.lines && <p className="text-sm font-medium text-destructive">{errors.lines}</p>}
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line.id} className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-6">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{isDispatch ? "Sales Order line" : "Item"}</Label>
                {isDispatch ? (
                  <Input value={line.salesOrderLineId || line.item} onChange={(e) => patchLine(line.id, { salesOrderLineId: e.target.value, item: e.target.value })} disabled={disabled} />
                ) : (
                  <BackendRecordSelect id={`invoice-line-item-${line.id}`} entity="products" value={line.item} onChange={(v) => patchLine(line.id, { item: v })} disabled={disabled} placeholder="Select item..." />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>UOM</Label>
                <Input value={line.uom ?? ""} onChange={(e) => patchLine(line.id, { uom: e.target.value })} disabled={disabled} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min={0} value={line.qty} onChange={(e) => patchLine(line.id, { qty: Number(e.target.value) || 0 })} disabled={disabled} />
              </div>
              {!isDispatch && (
                <>
                  <div className="space-y-1.5">
                    <Label>Unit price</Label>
                    <Input type="number" min={0} value={line.rate} onChange={(e) => patchLine(line.id, { rate: Number(e.target.value) || 0 })} disabled={disabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tax %</Label>
                    <Input type="number" min={0} value={line.taxPct ?? 0} onChange={(e) => patchLine(line.id, { taxPct: Number(e.target.value) || 0 })} disabled={disabled} />
                  </div>
                </>
              )}
              <div className="sm:col-span-6">
                <Input value={line.description ?? ""} onChange={(e) => patchLine(line.id, { description: e.target.value })} disabled={disabled} placeholder={isDispatch ? "Line note" : "Sales Order line reference"} />
              </div>
              {(errors[`lines.${index}`] || errors[`lines.${index}.quantity`] || errors[`lines.${index}.uom`] || errors[`lines.${index}.item`] || errors[`lines.${index}.rate`]) && (
                <p className="text-xs font-medium text-destructive sm:col-span-6">
                  {errors[`lines.${index}`] || errors[`lines.${index}.quantity`] || errors[`lines.${index}.uom`] || errors[`lines.${index}.item`] || errors[`lines.${index}.rate`]}
                </p>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...lines, { id: newLineId(), item: "", salesOrderLineId: "", description: "", uom: "", qty: 0, rate: 0, taxPct: 0 }])}>
          Add line
        </Button>
      </CardContent>
    </Card>
  );
}

function ProformaInvoiceFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const purchaseOrders = useRecords("purchase_orders");
  const setPurchaseOrder = (value: string) => {
    onChange("purchaseOrder", value);
    const po = purchaseOrders.find((row) => row.id === value);
    if (po?.fields.supplier) onChange("supplier", po.fields.supplier);
  };
  const currencies = ["USD", "NPR", "INR", "CNY"];
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Proforma Invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Header">
          <div className="space-y-1.5">
            <Label htmlFor="pi-po">Purchase Order<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="pi-po" entity="purchase_orders" value={fields.purchaseOrder} onChange={setPurchaseOrder} disabled={disabled} placeholder="Select PO..." />
            {fieldError(errors, "purchase_order", "purchaseOrder") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "purchase_order", "purchaseOrder")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-supplier">Supplier</Label>
            <BackendRecordSelect id="pi-supplier" entity="suppliers" value={fields.supplier} onChange={(v) => onChange("supplier", v)} disabled={disabled} placeholder="Select supplier..." />
            {fieldError(errors, "supplier", "supplier_id") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "supplier", "supplier_id")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-seller-number">Seller PI Number</Label>
            <Input id="pi-seller-number" value={String(fields.sellerPiNumber ?? "")} onChange={(e) => onChange("sellerPiNumber", e.target.value)} disabled={disabled} />
            {fieldError(errors, "seller_pi_number", "sellerPiNumber") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "seller_pi_number", "sellerPiNumber")}</p>}
          </div>
        </FormSection>
        <FormSection title="Commercial">
          <div className="space-y-1.5">
            <Label htmlFor="pi-currency">Currency</Label>
            <Select value={String(fields.currencyCode ?? "") || undefined} onValueChange={(v) => onChange("currencyCode", v)} disabled={disabled}>
              <SelectTrigger id="pi-currency">
                <SelectValue placeholder="Select currency..." />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError(errors, "currency_code", "currencyCode") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "currency_code", "currencyCode")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-total">Total Amount<span className="ml-0.5 text-destructive">*</span></Label>
            <Input id="pi-total" type="number" min="0" step="0.01" value={String(fields.totalAmount ?? "")} onChange={(e) => onChange("totalAmount", e.target.value)} disabled={disabled} />
            {fieldError(errors, "total_amount", "totalAmount") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "total_amount", "totalAmount")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-payment-terms">Payment Terms</Label>
            <Input id="pi-payment-terms" value={String(fields.paymentTerms ?? "")} onChange={(e) => onChange("paymentTerms", e.target.value)} disabled={disabled} />
            {fieldError(errors, "payment_terms", "paymentTerms") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "payment_terms", "paymentTerms")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-lead-time">Lead Time (days)</Label>
            <Input id="pi-lead-time" type="number" min="0" step="1" value={String(fields.leadTimeDays ?? "")} onChange={(e) => onChange("leadTimeDays", e.target.value)} disabled={disabled} />
            {fieldError(errors, "lead_time_days", "leadTimeDays") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "lead_time_days", "leadTimeDays")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-delivery">Expected Delivery</Label>
            <Input id="pi-delivery" type="date" value={String(fields.expectedDeliveryDate ?? "")} onChange={(e) => onChange("expectedDeliveryDate", e.target.value)} disabled={disabled} />
            {fieldError(errors, "expected_delivery_date", "expectedDeliveryDate") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "expected_delivery_date", "expectedDeliveryDate")}</p>}
          </div>
        </FormSection>
        <FormSection title="Documents">
          <div className="space-y-1.5">
            <Label htmlFor="pi-attachment">Attachment URL</Label>
            <Input id="pi-attachment" value={String(fields.attachmentUrl ?? "")} onChange={(e) => onChange("attachmentUrl", e.target.value)} disabled={disabled} />
            {fieldError(errors, "attachment_url", "attachmentUrl") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "attachment_url", "attachmentUrl")}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pi-notes">Notes</Label>
            <Textarea id="pi-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

function LetterOfCreditFields({
  fields,
  onChange,
  errors,
  disabled,
}: {
  fields: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const purchaseOrders = useRecords("purchase_orders");
  const proformaInvoices = useRecords("proforma_invoices");
  const setPurchaseOrder = (value: string) => {
    onChange("purchaseOrder", value);
    const po = purchaseOrders.find((row) => row.id === value);
    if (po?.fields.supplier) onChange("supplier", po.fields.supplier);
  };
  const setProformaInvoice = (value: string) => {
    onChange("proformaInvoice", value);
    const pi = proformaInvoices.find((row) => row.id === value);
    if (pi?.fields.purchaseOrder && !fields.purchaseOrder) onChange("purchaseOrder", pi.fields.purchaseOrder);
    if (pi?.fields.supplier) onChange("supplier", pi.fields.supplier);
    if (pi?.fields.currencyCode) onChange("currencyCode", pi.fields.currencyCode);
    if (pi?.fields.totalAmount) onChange("amount", pi.fields.totalAmount);
  };
  const currencies = ["USD", "NPR", "INR", "CNY"];
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Letter of Credit</CardTitle>
      </CardHeader>
      <CardContent>
        <FormSection title="Header">
          <div className="space-y-1.5">
            <Label htmlFor="lc-po">Purchase Order<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="lc-po" entity="purchase_orders" value={fields.purchaseOrder} onChange={setPurchaseOrder} disabled={disabled} placeholder="Select PO..." />
            {fieldError(errors, "purchase_order", "purchaseOrder") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "purchase_order", "purchaseOrder")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-pi">Proforma Invoice<span className="ml-0.5 text-destructive">*</span></Label>
            <BackendRecordSelect id="lc-pi" entity="proforma_invoices" value={fields.proformaInvoice} onChange={setProformaInvoice} disabled={disabled} placeholder="Select PI..." />
            {fieldError(errors, "proforma_invoice", "proformaInvoice") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "proforma_invoice", "proformaInvoice")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-supplier">Supplier</Label>
            <BackendRecordSelect id="lc-supplier" entity="suppliers" value={fields.supplier} onChange={(v) => onChange("supplier", v)} disabled={disabled} placeholder="Select supplier..." />
            {fieldError(errors, "supplier", "supplier_id") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "supplier", "supplier_id")}</p>}
          </div>
        </FormSection>
        <FormSection title="LC">
          <div className="space-y-1.5">
            <Label htmlFor="lc-bank">Bank<span className="ml-0.5 text-destructive">*</span></Label>
            <Input id="lc-bank" value={String(fields.bankName ?? "")} onChange={(e) => onChange("bankName", e.target.value)} disabled={disabled} />
            {fieldError(errors, "bank_name", "bankName") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "bank_name", "bankName")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-number">Bank LC Number</Label>
            <Input id="lc-number" value={String(fields.lcNumber ?? "")} onChange={(e) => onChange("lcNumber", e.target.value)} disabled={disabled} />
            {fieldError(errors, "lc_number", "lcNumber") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "lc_number", "lcNumber")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-currency">Currency</Label>
            <Select value={String(fields.currencyCode ?? "") || undefined} onValueChange={(v) => onChange("currencyCode", v)} disabled={disabled}>
              <SelectTrigger id="lc-currency">
                <SelectValue placeholder="Select currency..." />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError(errors, "currency_code", "currencyCode") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "currency_code", "currencyCode")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-amount">LC Amount<span className="ml-0.5 text-destructive">*</span></Label>
            <Input id="lc-amount" type="number" min="0" step="0.01" value={String(fields.amount ?? "")} onChange={(e) => onChange("amount", e.target.value)} disabled={disabled} />
            {fieldError(errors, "amount") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "amount")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-expiry">Expiry Date</Label>
            <Input id="lc-expiry" type="date" value={String(fields.expiryDate ?? "")} onChange={(e) => onChange("expiryDate", e.target.value)} disabled={disabled} />
            {fieldError(errors, "expiry_date", "expiryDate") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "expiry_date", "expiryDate")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-latest-shipment">Latest Shipment</Label>
            <Input id="lc-latest-shipment" type="date" value={String(fields.latestShipmentDate ?? "")} onChange={(e) => onChange("latestShipmentDate", e.target.value)} disabled={disabled} />
            {fieldError(errors, "latest_shipment_date", "latestShipmentDate") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "latest_shipment_date", "latestShipmentDate")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-draft-scan">Draft LC scan URL</Label>
            <Input id="lc-draft-scan" value={String(fields.draftScanUrl ?? "")} onChange={(e) => onChange("draftScanUrl", e.target.value)} disabled={disabled} />
            {fieldError(errors, "draft_scan_url", "draftScanUrl") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "draft_scan_url", "draftScanUrl")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-final-number">Final LC Number</Label>
            <Input id="lc-final-number" value={String(fields.finalLcNumber ?? "")} onChange={(e) => onChange("finalLcNumber", e.target.value)} disabled={disabled} />
            {fieldError(errors, "final_lc_number", "finalLcNumber") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "final_lc_number", "finalLcNumber")}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lc-seller-note">Seller Approval Note</Label>
            <Textarea id="lc-seller-note" rows={3} value={String(fields.sellerApprovalNote ?? "")} onChange={(e) => onChange("sellerApprovalNote", e.target.value)} disabled={disabled} />
            {fieldError(errors, "seller_approval_note", "sellerApprovalNote") && <p className="text-xs font-medium text-destructive">{fieldError(errors, "seller_approval_note", "sellerApprovalNote")}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lc-notes">Notes</Label>
            <Textarea id="lc-notes" rows={3} value={String(fields.notes ?? "")} onChange={(e) => onChange("notes", e.target.value)} disabled={disabled} />
            {errors.notes && <p className="text-xs font-medium text-destructive">{errors.notes}</p>}
          </div>
        </FormSection>
      </CardContent>
    </Card>
  );
}

export function RecordFormPage({ mode }: { mode: "new" | "edit" }) {
  const params = useParams({ strict: false }) as { entity?: string; id?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const module = parsed?.module ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor(module, slug) ?? "";
  const def = getEntity(entity);
  const existing = useRecord(entity, code);
  const loadStatus = useRecordsStatus(entity, code);
  const navigate = useNavigate();
  const isProductForm = entity === "products";
  const isPurchaseOrderForm = entity === "purchase_orders";
  const isShipmentForm = entity === "shipments";
  const isProformaInvoiceForm = entity === "proforma_invoices";
  const isLetterOfCreditForm = entity === "letters_of_credit";
  const isLandedCostForm = entity === "landed_cost_documents";
  const isTypedSalesForm = entity === "sales_orders" || entity === "deliveries" || entity === "invoices";
  const detailRouteById = isShipmentForm || isProformaInvoiceForm || isLetterOfCreditForm || isLandedCostForm || isTypedSalesForm || M2_TYPED_DETAIL_ENTITIES.has(entity);
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const sourceSalesOrderId = query.get("sales_order") ?? "";
  const sourceDispatchId = query.get("dispatch_note") ?? query.get("delivery") ?? "";
  const sourceDispatch = useRecord("deliveries", sourceDispatchId);
  const invoiceSalesOrderId = sourceSalesOrderId || String(sourceDispatch?.fields.salesOrder ?? "");
  const sourceSalesOrder = useRecord("sales_orders", entity === "deliveries" ? sourceSalesOrderId : invoiceSalesOrderId);

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
    if (isPurchaseOrderForm && mode === "new") {
      fields.exchangeRate = fields.exchangeRate || 1;
      fields.currency = fields.currency || "NPR";
    }
    if (isShipmentForm && mode === "new") {
      fields.isActive = true;
    }
    if ((isProformaInvoiceForm || isLetterOfCreditForm) && mode === "new") {
      fields.currencyCode = fields.currencyCode || "USD";
    }
    if (isLandedCostForm && mode === "new") {
      fields.currency = fields.currency || "NPR";
      fields.purchaseQuantity = fields.purchaseQuantity || 0;
      fields.purchaseUnitCost = fields.purchaseUnitCost || 0;
    }
    if (entity === "deliveries" && mode === "new" && sourceSalesOrder) {
      fields.salesOrder = sourceSalesOrder.id;
      fields.warehouse = sourceSalesOrder.fields.warehouse || "";
      fields.notes = fields.notes || `Dispatch for ${sourceSalesOrder.code}`;
    }
    if (entity === "invoices" && mode === "new") {
      fields.exchangeRate = fields.exchangeRate || 1;
      fields.currency = fields.currency || sourceSalesOrder?.fields.currency || "NPR";
      if (sourceSalesOrder) {
        fields.salesOrder = sourceSalesOrder.id;
        fields.customer = sourceSalesOrder.fields.customer || "";
      }
      if (sourceDispatch) {
        fields.delivery = sourceDispatch.id;
        fields.dispatchNote = sourceDispatch.id;
        fields.salesOrder = sourceDispatch.fields.salesOrder || fields.salesOrder;
        fields.notes = fields.notes || `Invoice for ${sourceDispatch.code}`;
      }
    }
    return fields;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.key, existing?.id, mode, isProductForm, isPurchaseOrderForm, isShipmentForm, isProformaInvoiceForm, isLetterOfCreditForm, isLandedCostForm, entity, sourceSalesOrder?.id, sourceDispatch?.id]);

  const sourceSalesOrderLines = Array.isArray(sourceSalesOrder?.fields.salesOrderLines) ? sourceSalesOrder.fields.salesOrderLines as Array<Record<string, unknown>> : [];
  const sourceDispatchLines = Array.isArray(sourceDispatch?.fields.dispatchLines) ? sourceDispatch.fields.dispatchLines as Array<Record<string, unknown>> : [];
  const suggestedSalesLines = useMemo<LineItem[]>(() => {
    if (entity === "deliveries" && mode === "new" && sourceSalesOrderLines.length) {
      return sourceSalesOrderLines
        .filter((line) => Number(line.ordered_quantity ?? 0) > Number(line.dispatched_quantity ?? 0))
        .map((line) => ({
          id: newLineId(),
          item: String(line.id ?? ""),
          salesOrderLineId: String(line.id ?? ""),
          description: `SO line ${line.line_no ?? ""}`.trim(),
          uom: String(line.uom ?? ""),
          warehouse: String(line.warehouse ?? sourceSalesOrder?.fields.warehouse ?? ""),
          qty: 0,
          rate: 0,
          taxPct: 0,
        }));
    }
    if (entity === "invoices" && mode === "new" && sourceDispatchLines.length && sourceSalesOrderLines.length) {
      return sourceDispatchLines.map((line) => {
        const soLine = sourceSalesOrderLines.find((row) => String(row.id) === String(line.sales_order_line));
        return {
          id: newLineId(),
          item: String(soLine?.item ?? ""),
          salesOrderLineId: String(line.sales_order_line ?? ""),
          description: `SO line ${soLine?.line_no ?? line.sales_order_line ?? ""}`.trim(),
          uom: String(line.uom ?? soLine?.uom ?? ""),
          qty: Number(line.quantity ?? 0),
          rate: Number(soLine?.unit_price ?? 0),
          taxPct: Number(soLine?.tax_pct ?? 0),
        };
      });
    }
    if (entity === "invoices" && mode === "new" && sourceSalesOrderLines.length) {
      return sourceSalesOrderLines
        .filter((line) => Number(line.ordered_quantity ?? 0) > Number(line.invoiced_quantity ?? 0))
        .map((line) => ({
          id: newLineId(),
          item: String(line.item ?? ""),
          salesOrderLineId: String(line.id ?? ""),
          description: `SO line ${line.line_no ?? ""}`.trim(),
          uom: String(line.uom ?? ""),
          qty: 0,
          rate: Number(line.unit_price ?? 0),
          taxPct: Number(line.tax_pct ?? 0),
        }));
    }
    return [];
  }, [entity, mode, sourceSalesOrderLines, sourceDispatchLines, sourceSalesOrder?.fields.warehouse]);

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
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFields(initialFields);
    setLines(
      existing?.lines.length
        ? existing.lines
        : def?.lines
          ? suggestedSalesLines.length
            ? suggestedSalesLines
            : isPurchaseOrderForm
            ? [{ id: newLineId(), item: "", description: "", uom: "", warehouse: "", qty: 1, rate: 0, discountPct: 0, taxPct: 0 }]
            : makeLines(1)
          : [],
    );
    setDirty(false);
    setFormError("");
    setFieldErrors({});
    if (mode === "new" && isProductForm) {
      setCodeMode("auto");
      setManualCode("");
    }
  }, [existing?.id, mode, entity, initialFields, existing?.lines, def?.lines, isProductForm, isPurchaseOrderForm, suggestedSalesLines]);

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
  if (mode === "new" && isLiveSession() && (entity === "gate_entries" || entity === "grns")) {
    return (
      <EmptyState
        title={`${def.singular} is created from the live inbound flow`}
        description="Open a receivable Purchase Order and use the Inbound journey so the backend can enforce gate, LC and GRN posting rules."
        action={
          <Button asChild variant="outline">
            <Link to="/purchase/orders">Open Purchase Orders</Link>
          </Button>
        }
      />
    );
  }
  if (mode === "edit" && !existing && loadStatus.loading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading {code}…</p>;
  }
  if (mode === "edit" && !existing) {
    return (
      <EmptyState
        title={loadStatus.error ? "Could not load record" : "Record not found"}
        description={loadStatus.error ? `${code}: ${loadStatus.error}` : `${code} is not in the local store.`}
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
    setFieldErrors((s) => {
      if (!s[key]) return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
    setFields((s) => ({ ...s, [key]: value }));
  };

  const save = async () => {
    if (saving) return;
    setFormError("");
    setFieldErrors({});
    if (isPurchaseOrderForm && mode === "new") {
      const poErrors = validatePurchaseOrder(fields, lines);
      if (Object.keys(poErrors).length) {
        setFieldErrors(poErrors);
        toast.error("Fix the highlighted Purchase Order fields.");
        return;
      }
    }
    if (entity === "sales_orders" && mode === "new") {
      const soErrors = validateSalesOrder(fields, lines);
      if (Object.keys(soErrors).length) {
        setFieldErrors(soErrors);
        toast.error("Fix the highlighted Sales Order fields.");
        return;
      }
    }
    if (entity === "deliveries" && mode === "new") {
      const dispatchErrors = validateDispatch(fields, lines);
      if (Object.keys(dispatchErrors).length) {
        setFieldErrors(dispatchErrors);
        toast.error("Fix the highlighted Dispatch fields.");
        return;
      }
    }
    if (entity === "invoices" && mode === "new") {
      const invoiceErrors = validateInvoice(fields, lines);
      if (Object.keys(invoiceErrors).length) {
        setFieldErrors(invoiceErrors);
        toast.error("Fix the highlighted Invoice fields.");
        return;
      }
    }
    if (isShipmentForm) {
      const shipmentErrors = validateShipment(fields);
      if (Object.keys(shipmentErrors).length) {
        setFieldErrors(shipmentErrors);
        toast.error("Fix the highlighted Shipment fields.");
        return;
      }
    }
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
        navigate({ to: recordPath(entity, detailRouteById ? created.id : created.code) as never });
      } else if (existing) {
        const updated = await svc.update(existing.id, {
          title,
          fields,
          lines: def.lines ? lines : existing.lines,
        });
        toast.success(`${updated.code} updated`);
        setDirty(false);
        navigate({ to: recordPath(entity, detailRouteById ? updated.id : updated.code) as never });
      }
    } catch (err) {
      const nextError = formErrorFrom(err);
      setFormError(nextError.message);
      setFieldErrors(nextError.fields);
      toast.error(nextError.message);
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    const to = mode === "edit" && existing ? recordPath(entity, detailRouteById ? existing.id : existing.code) : list;
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
        {formError && (
          <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm font-medium text-destructive">{formError}</CardContent>
          </Card>
        )}

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

        {isPurchaseOrderForm && mode === "new" ? (
          <PurchaseOrderFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : isProformaInvoiceForm ? (
          <ProformaInvoiceFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : isLetterOfCreditForm ? (
          <LetterOfCreditFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : isShipmentForm ? (
          <ShipmentFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : entity === "deliveries" && mode === "new" ? (
          <SalesDispatchFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : entity === "invoices" && mode === "new" ? (
          <SalesInvoiceFields fields={fields} onChange={setField} errors={fieldErrors} disabled={saving} />
        ) : sections.map(([title, sectionFields]) => (
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
                    error={fieldErrors[f.key]}
                  />
                ))}
              </FormSection>
            </CardContent>
          </Card>
        ))}

        {isPurchaseOrderForm && mode === "new" ? (
          <PurchaseOrderLineEditor
            lines={lines}
            onChange={(next) => {
              setDirty(true);
              setLines(next);
              setFieldErrors((s) => {
                if (!Object.keys(s).some((key) => key === "lines" || key.startsWith("lines."))) return s;
                const nextErrors = { ...s };
                for (const key of Object.keys(nextErrors)) if (key === "lines" || key.startsWith("lines.")) delete nextErrors[key];
                return nextErrors;
              });
            }}
            errors={fieldErrors}
            disabled={saving}
          />
        ) : (entity === "deliveries" || entity === "invoices") && mode === "new" ? (
          <SalesBackendLineEditor
            entity={entity}
            lines={lines}
            onChange={(next) => {
              setDirty(true);
              setLines(next);
              setFieldErrors((s) => {
                if (!Object.keys(s).some((key) => key === "lines" || key.startsWith("lines."))) return s;
                const nextErrors = { ...s };
                for (const key of Object.keys(nextErrors)) if (key === "lines" || key.startsWith("lines.")) delete nextErrors[key];
                return nextErrors;
              });
            }}
            errors={fieldErrors}
            disabled={saving}
          />
        ) : def.lines && (
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
