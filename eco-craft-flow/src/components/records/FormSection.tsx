import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FieldDef } from "@/features/registry/entities";
import { EntitySelector, BatchSelector, WarehouseSelector } from "@/components/records/EntitySelector";
import { useFieldAccess } from "@/lib/permissions";

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</legend>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

interface RecordFieldProps {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  error?: string;
  idPrefix?: string;
  entity?: string;
}

export function RecordField({ field, value, onChange, readOnly, error, idPrefix = "f", entity }: RecordFieldProps) {
  const access = useFieldAccess(entity ?? "", field.key);
  if (entity && access === "hidden") return null;
  const locked = readOnly || (entity ? access === "readonly" : false);
  const id = `${idPrefix}-${field.key}`;
  const strVal = value == null ? "" : String(value);

  let control: ReactNode;
  if (locked) {
    control = (
      <div className="min-h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        {field.type === "switch" ? (value ? "Yes" : "No") : strVal || "—"}
      </div>
    );
  } else if (field.type === "textarea") {
    control = <Textarea id={id} rows={3} value={strVal} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === "select") {
    control = (
      <Select value={strVal || undefined} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "switch") {
    control = (
      <div className="flex h-9 items-center">
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  } else if (field.type === "ref") {
    const ref = field.refEntity ?? "";
    if (ref === "warehouses") control = <WarehouseSelector id={id} value={strVal} onChange={onChange} />;
    else if (ref === "batches") control = <BatchSelector id={id} value={strVal} onChange={onChange} />;
    else if (ref) control = <EntitySelector entity={ref} id={id} value={strVal} onChange={onChange} />;
    else control = <Input id={id} value={strVal} onChange={(e) => onChange(e.target.value)} />;
  } else {
    control = (
      <Input
        id={id}
        type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
        value={strVal}
        onChange={(e) => {
          if (field.type === "number" || field.type === "currency") {
            onChange(e.target.value === "" ? "" : Number(e.target.value));
          } else onChange(e.target.value);
        }}
      />
    );
  }

  return (
    <div className={cn("space-y-1.5", field.colSpan === 2 && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-sm">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {control}
      {field.help && !error && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
