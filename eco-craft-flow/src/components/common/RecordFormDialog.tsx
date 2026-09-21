import { useMemo, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import type { FormDefinition, FormFieldDef, FormValues } from "@/features/forms/types";

function fieldSchema(field: FormFieldDef): z.ZodTypeAny {
  switch (field.type) {
    case "switch":
      return z.boolean().optional();
    case "number":
    case "currency": {
      let schema = z.coerce.number({ invalid_type_error: `${field.label} must be a number` });
      if (field.min !== undefined) schema = schema.min(field.min, `Minimum ${field.min}`);
      if (field.max !== undefined) schema = schema.max(field.max, `Maximum ${field.max}`);
      return field.required ? schema : schema.optional().or(z.literal("").transform(() => undefined));
    }
    case "email": {
      const schema = z.string().email("Enter a valid email");
      return field.required ? schema : schema.optional().or(z.literal(""));
    }
    default: {
      const schema = z.string();
      return field.required
        ? schema.min(1, `${field.label} is required`)
        : schema.optional();
    }
  }
}

function buildSchema(def: FormDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const section of def.sections) {
    for (const field of section.fields) shape[field.name] = fieldSchema(field);
  }
  return z.object(shape);
}

function buildDefaults(def: FormDefinition, initial?: FormValues): FormValues {
  const values: FormValues = {};
  for (const section of def.sections) {
    for (const field of section.fields) {
      values[field.name] =
        initial?.[field.name] ??
        field.defaultValue ??
        (field.type === "switch" ? false : "");
    }
  }
  return values;
}

export interface RecordFormDialogProps {
  definition: FormDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: FormValues;
  /** Optional handler; defaults to a "backend pending" toast. */
  onSubmit?: (values: FormValues) => void | Promise<void>;
  trigger?: ReactNode;
}

export function RecordFormDialog({
  definition,
  open,
  onOpenChange,
  initialValues,
  onSubmit,
}: RecordFormDialogProps) {
  const schema = useMemo(() => buildSchema(definition), [definition]);
  const defaults = useMemo(
    () => buildDefaults(definition, initialValues),
    [definition, initialValues],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: defaults,
  });

  const submit = handleSubmit(async (values) => {
    if (onSubmit) {
      await onSubmit(values);
    } else {
      toast.success(`${definition.title} captured`, {
        description: `Will be sent to ${definition.endpoint} once the Django backend is connected.`,
      });
    }
    reset(defaults);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset(defaults);
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{definition.title}</DialogTitle>
          <DialogDescription>{definition.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {definition.sections.map((section) => (
              <fieldset key={section.title} className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.fields.map((field) => {
                    const error = errors[field.name]?.message as string | undefined;
                    const id = `${definition.key}-${field.name}`;
                    return (
                      <div
                        key={field.name}
                        className={cn("space-y-1.5", field.colSpan === 2 && "sm:col-span-2")}
                      >
                        <Label htmlFor={id} className="text-sm">
                          {field.label}
                          {field.required && <span className="ml-0.5 text-destructive">*</span>}
                        </Label>

                        {field.type === "textarea" && (
                          <Textarea id={id} rows={3} placeholder={field.placeholder} {...register(field.name)} />
                        )}

                        {field.type === "select" && (
                          <Controller
                            control={control}
                            name={field.name}
                            render={({ field: rhf }) => (
                              <Select
                                value={(rhf.value as string) || undefined}
                                onValueChange={rhf.onChange}
                              >
                                <SelectTrigger id={id}>
                                  <SelectValue placeholder={field.placeholder ?? "Select…"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        )}

                        {field.type === "switch" && (
                          <Controller
                            control={control}
                            name={field.name}
                            render={({ field: rhf }) => (
                              <div className="flex h-9 items-center">
                                <Switch
                                  id={id}
                                  checked={Boolean(rhf.value)}
                                  onCheckedChange={rhf.onChange}
                                />
                              </div>
                            )}
                          />
                        )}

                        {!["textarea", "select", "switch"].includes(field.type) && (
                          <Input
                            id={id}
                            type={
                              field.type === "date"
                                ? "date"
                                : field.type === "number" || field.type === "currency"
                                  ? "number"
                                  : field.type === "email"
                                    ? "email"
                                    : field.type === "tel"
                                      ? "tel"
                                      : "text"
                            }
                            inputMode={
                              field.type === "number" || field.type === "currency"
                                ? "decimal"
                                : field.type === "tel"
                                  ? "tel"
                                  : undefined
                            }
                            step={field.step}
                            min={field.min}
                            max={field.max}
                            placeholder={field.placeholder}
                            {...register(field.name)}
                          />
                        )}

                        {field.help && !error && (
                          <p className="text-xs text-muted-foreground">{field.help}</p>
                        )}
                        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {definition.endpoint}
            </p>
          </div>

          <DialogFooter className="gap-2 border-t px-5 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              {definition.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}