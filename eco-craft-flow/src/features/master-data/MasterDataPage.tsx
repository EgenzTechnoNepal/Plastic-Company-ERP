import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/services/api/client";
import {
  createMasterData,
  getMasterData,
  listMasterData,
  updateMasterData,
  type MasterDataRow,
} from "@/services/api/masterData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type FieldKind = "text" | "number" | "date" | "select" | "switch";

export interface OptionSource {
  path: string;
  label: (row: MasterDataRow) => string;
  value?: (row: MasterDataRow) => string;
}

export interface MasterField {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  source?: OptionSource;
  placeholder?: string;
  defaultValue?: unknown;
  readOnlyOnEdit?: boolean;
}

export interface MasterColumn {
  key: string;
  label: string;
  render?: (row: MasterDataRow) => string;
  align?: "left" | "right";
}

export interface MasterFilter {
  key: string;
  label: string;
  param: string;
  options?: Array<{ value: string; label: string }>;
  source?: OptionSource;
}

export interface MasterDataPageConfig {
  title: string;
  description: string;
  path: string;
  queryKey: string;
  searchPlaceholder?: string;
  searchParam?: string;
  includeCompanyOnCreate?: boolean;
  columns: MasterColumn[];
  fields: MasterField[];
  filters?: MasterFilter[];
  getRowTitle: (row: MasterDataRow) => string;
  getRowSubtitle?: (row: MasterDataRow) => string;
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function fieldError(errors: Record<string, unknown>, key: string): string | undefined {
  const value = errors[key];
  if (!value) return undefined;
  return Array.isArray(value) ? value.map(String).join(" ") : String(value);
}

function emptyForm(fields: MasterField[]) {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    acc[field.key] = field.defaultValue ?? (field.kind === "switch" ? true : "");
    return acc;
  }, {});
}

function useOptions(source?: OptionSource) {
  const query = useQuery({
    queryKey: ["master-options", source?.path],
    queryFn: () => listMasterData<MasterDataRow>(source!.path),
    enabled: Boolean(source),
    staleTime: 60_000,
  });
  return useMemo(
    () =>
      source
        ? (query.data?.rows ?? []).map((row) => ({
            value: source.value ? source.value(row) : String(row.id),
            label: source.label(row),
          }))
        : [],
    [query.data?.rows, source],
  );
}

function MasterFieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: MasterField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const options = useOptions(field.source);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required ? " *" : ""}
      </Label>
      {field.kind === "select" || field.options || field.source ? (
        <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={field.key}>
            <SelectValue placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {[...(field.options ?? []), ...options].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.kind === "switch" ? (
        <div className="flex h-9 items-center">
          <Switch checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} />
        </div>
      ) : (
        <Input
          id={field.key}
          type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MasterFilterSelect({
  filter,
  value,
  onChange,
}: {
  filter: MasterFilter;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useOptions(filter.source);

  return (
    <Select value={value || "all"} onValueChange={(next) => onChange(next === "all" ? "" : next)}>
      <SelectTrigger className="w-full lg:w-48">
        <SelectValue placeholder={filter.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{filter.label}</SelectItem>
        {[...(filter.options ?? []), ...options].map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MasterForm({
  config,
  open,
  mode,
  row,
  onClose,
}: {
  config: MasterDataPageConfig;
  open: boolean;
  mode: "create" | "edit";
  row?: MasterDataRow | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() => emptyForm(config.fields));
  const [errors, setErrors] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setValues(row ? { ...emptyForm(config.fields), ...row } : emptyForm(config.fields));
    setErrors({});
  }, [config.fields, row, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== "" && value !== undefined),
      );
      return mode === "edit" && row
        ? updateMasterData(config.path, row.id, body)
        : createMasterData(config.path, body, config.includeCompanyOnCreate);
    },
    onSuccess: (saved) => {
      toast.success(`${config.getRowTitle(saved)} ${mode === "edit" ? "updated" : "created"}`);
      client.invalidateQueries({ queryKey: ["master-data", config.queryKey] });
      client.invalidateQueries({ queryKey: ["master-options"] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  const missing = config.fields.find((field) => field.required && !values[field.key]);
  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `Edit ${config.title}` : `New ${config.title}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {config.fields.map((field) => {
            const error = fieldError(errors, field.key);
            const disabled = mutation.isPending || (mode === "edit" && field.readOnlyOnEdit);
            return (
              <MasterFieldControl
                key={field.key}
                field={field}
                value={values[field.key]}
                error={error}
                disabled={disabled}
                onChange={(value) => setValue(field.key, value)}
              />
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Boolean(missing)}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MasterDataPage({ config }: { config: MasterDataPageConfig }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<{
    mode: "create" | "edit";
    row?: MasterDataRow | null;
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const params = useMemo(() => {
    const next: Record<string, string | undefined> = {};
    if (config.searchParam && query.trim()) next[config.searchParam] = query.trim();
    for (const filter of config.filters ?? []) {
      if (filters[filter.key]) next[filter.param] = filters[filter.key];
    }
    return next;
  }, [config.filters, config.searchParam, filters, query]);

  const list = useQuery({
    queryKey: ["master-data", config.queryKey, params],
    queryFn: () => listMasterData<MasterDataRow>(config.path, params),
  });

  const detail = useQuery({
    queryKey: ["master-detail", config.queryKey, detailId],
    queryFn: () => getMasterData<MasterDataRow>(config.path, detailId!),
    enabled: Boolean(detailId),
  });

  const localRows = list.data?.rows ?? [];
  const rows = config.searchParam
    ? localRows
    : localRows.filter((row) =>
        query
          ? config.columns.some((column) =>
              formatValue(column.render ? column.render(row) : row[column.key])
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
          : true,
      );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{config.title}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-1.5" onClick={() => setDialog({ mode: "create" })}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={config.searchPlaceholder ?? `Search ${config.title.toLowerCase()}...`}
                className="pl-9"
              />
            </div>
            {(config.filters ?? []).map((filter) => {
              return (
                <MasterFilterSelect
                  key={filter.key}
                  filter={filter}
                  value={filters[filter.key] ?? ""}
                  onChange={(value) => setFilters((prev) => ({ ...prev, [filter.key]: value }))}
                />
              );
            })}
          </div>

          {list.isError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
            >
              Could not load {config.title.toLowerCase()}:{" "}
              {list.error instanceof Error ? list.error.message : "API request failed"}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {config.columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={column.align === "right" ? "text-right" : undefined}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(row.id)}
                  >
                    {config.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={column.align === "right" ? "text-right" : undefined}
                      >
                        {column.key === "is_active" ? (
                          <Badge variant={row.is_active === false ? "secondary" : "default"}>
                            {row.is_active === false ? "Inactive" : "Active"}
                          </Badge>
                        ) : (
                          formatValue(column.render ? column.render(row) : row[column.key])
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDialog({ mode: "edit", row });
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {list.isLoading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading {config.title.toLowerCase()}...
            </div>
          )}
          {!list.isLoading && !list.isError && rows.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No {config.title.toLowerCase()} found.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {detail.data ? config.getRowTitle(detail.data) : "Loading..."}
            </DialogTitle>
          </DialogHeader>
          {detail.isError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
            >
              Could not load detail:{" "}
              {detail.error instanceof Error ? detail.error.message : "API request failed"}
            </div>
          )}
          {detail.data && (
            <dl className="grid gap-3 sm:grid-cols-2">
              {config.columns.map((column) => (
                <div key={column.key}>
                  <dt className="text-xs text-muted-foreground">{column.label}</dt>
                  <dd className="text-sm font-medium">
                    {formatValue(
                      column.render ? column.render(detail.data) : detail.data[column.key],
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog && (
        <MasterForm
          config={config}
          open={Boolean(dialog)}
          mode={dialog.mode}
          row={dialog.row}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
