import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, type CsvRow } from "@/lib/export";
import { cn } from "@/lib/utils";
import { PermissionGuard } from "@/lib/permissions";
import { logAudit } from "@/services/entityService";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Rendered in the desktop table. */
  cell: (row: T) => ReactNode;
  /** Plain value used for CSV export. */
  value?: (row: T) => string | number;
  className?: string;
}

export interface ListFilter<T> {
  key: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  match: (row: T, value: string) => boolean;
}

/** Search + status/type filters — the FilterBar used by every list. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">{children}</div>;
}

interface DataListPageProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Array<Column<T>>;
  search?: (row: T, query: string) => boolean;
  searchPlaceholder?: string;
  filters?: Array<ListFilter<T>>;
  /** Mobile card renderer; falls back to the first four columns. */
  mobileCard?: (row: T) => ReactNode;
  exportName?: string;
  emptyMessage?: string;
  toolbarExtra?: ReactNode;
  /** When set, rows open this href (list → record chrome). */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  auditModule?: string;
  auditEntity?: string;
}

export function DataListPage<T>({
  rows,
  rowKey,
  columns,
  search,
  searchPlaceholder = "Search…",
  filters = [],
  mobileCard,
  exportName = "export",
  emptyMessage = "No records match your filters.",
  toolbarExtra,
  rowHref,
  onRowClick,
  auditModule,
  auditEntity,
}: DataListPageProps<T>) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<Record<string, string>>({});

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (query && search && !search(row, query.toLowerCase())) return false;
        return filters.every((f) => {
          const value = filterState[f.key] ?? "all";
          return value === "all" || f.match(row, value);
        });
      }),
    [rows, query, search, filters, filterState],
  );

  const go = (row: T) => {
    const href = rowHref?.(row);
    if (href) {
      navigate({ to: href as never });
      return;
    }
    onRowClick?.(row);
  };

  const handleExport = () => {
    const csv: CsvRow[] = filtered.map((row) => {
      const record: CsvRow = {};
      for (const col of columns) {
        record[col.header] = col.value ? col.value(row) : "";
      }
      return record;
    });
    downloadCsv(exportName, csv);
    logAudit({
      action: "export",
      module: auditModule ?? "system",
      entity: auditEntity ?? exportName,
      after: { count: csv.length, file: exportName },
    });
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <FilterBar>
          {search && (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Select
                key={f.key}
                value={filterState[f.key] ?? "all"}
                onValueChange={(v) => setFilterState((s) => ({ ...s, [f.key]: v }))}
              >
                <SelectTrigger className="w-full min-w-36 sm:w-40">
                  <SelectValue placeholder={f.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{f.placeholder}</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            {toolbarExtra}
            <PermissionGuard action="export">
              <Button variant="outline" size="icon" aria-label="Export CSV" onClick={handleExport}>
                <Download className="h-4 w-4" />
              </Button>
            </PermissionGuard>
          </div>
        </FilterBar>

        <div className="grid gap-3 md:hidden">
          {filtered.map((row) => (
            <div
              key={rowKey(row)}
              className={cn("rounded-lg border bg-card p-4", (rowHref || onRowClick) && "cursor-pointer transition-colors hover:bg-muted/40")}
              role={rowHref || onRowClick ? "link" : undefined}
              onClick={() => go(row)}
            >
              {mobileCard ? (
                mobileCard(row)
              ) : (
                <dl className="space-y-1.5 text-sm">
                  {columns.slice(0, 5).map((col) => (
                    <div key={col.key} className="flex items-start justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">{col.header}</dt>
                      <dd className="min-w-0 text-right font-medium">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(col.align === "right" && "text-right", col.className)}
                  >
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={rowHref || onRowClick ? "cursor-pointer" : undefined}
                  onClick={() => go(row)}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(col.align === "right" && "text-right", col.className)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </CardContent>
    </Card>
  );
}
