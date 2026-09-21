import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataListPage, type ListFilter } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { getEntity } from "@/features/registry/entities";
import { npr } from "@/lib/export";
import { getField, num, searchRecord, statusLabel, statusTone, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { recordTotal, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

export interface EntityKpi {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "primary" | "accent" | "secondary" | "muted";
}

interface EntityListPageProps {
  entity: string;
  kpis?: EntityKpi[] | ((rows: ErpRecord[]) => EntityKpi[]);
  /** Extra predicate on top of the store list (e.g. QC stage). */
  filter?: (row: ErpRecord) => boolean;
  extraFilters?: Array<ListFilter<ErpRecord>>;
  exportName?: string;
}

function formatCell(row: ErpRecord, key: string, type?: string) {
  if (key === "total" || type === "currency") return npr(key === "total" ? recordTotal(row) : num(row, key.replace(/^fields\./, "")));
  if (type === "percent") return `${num(row, key.replace(/^fields\./, ""))}%`;
  if (type === "status") {
    const s = str(row, key === "status" ? "status" : key.replace(/^fields\./, ""));
    return <StatusBadge tone={statusTone(s)}>{statusLabel(s)}</StatusBadge>;
  }
  if (type === "number") return num(row, key.replace(/^fields\./, "")).toLocaleString("en-IN");
  const raw = getField(row, key);
  return raw == null || raw === "" ? "—" : String(raw);
}

function plainValue(row: ErpRecord, key: string, type?: string): string | number {
  if (key === "total" || type === "currency") return key === "total" ? recordTotal(row) : num(row, key.replace(/^fields\./, ""));
  if (type === "number" || type === "percent") return num(row, key.replace(/^fields\./, ""));
  const raw = getField(row, key);
  return raw == null ? "" : String(raw);
}

export function EntityListPage({ entity, kpis, filter, extraFilters = [], exportName }: EntityListPageProps) {
  const def = getEntity(entity);
  const all = useRecords(entity);
  const rows = filter ? all.filter(filter) : all;
  if (!def) return <p className="text-sm text-muted-foreground">Unknown entity: {entity}</p>;

  const kpiItems = typeof kpis === "function" ? kpis(rows) : kpis;
  const filters: Array<ListFilter<ErpRecord>> = [
    {
      key: "status",
      placeholder: "All status",
      options: def.statuses.map((s) => ({ value: s, label: statusLabel(s) })),
      match: (row, value) => row.status === value,
    },
    ...extraFilters,
  ];

  const searchKeys = def.searchable ?? def.columns.map((c) => c.key);

  return (
    <div className="space-y-6">
      {kpiItems && kpiItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpiItems.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} hint={k.hint} icon={k.icon} accent={k.accent} />
          ))}
        </div>
      )}
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName={exportName ?? entity}
        emptyMessage={`No ${def.label.toLowerCase()} match your filters.`}
        searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
        search={(r, q) => searchRecord(r, q, searchKeys)}
        rowHref={(r) => recordPath(entity, r.code)}
        auditModule={def.module}
        auditEntity={entity}
        filters={filters}
        columns={def.columns.map((col) => ({
          key: col.key,
          header: col.label,
          align: col.align,
          className: col.primary ? "font-mono text-xs" : undefined,
          cell: (r: ErpRecord) => formatCell(r, col.key, col.type),
          value: (r: ErpRecord) => plainValue(r, col.key, col.type),
        }))}
        mobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                <div className="truncate font-semibold">{r.title}</div>
              </div>
              <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {def.columns.slice(2, 6).map((col) => (
                <div key={col.key}>
                  <div>{col.label}</div>
                  <div className="font-medium text-foreground">{formatCell(r, col.key, col.type)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      />
    </div>
  );
}

export { str, num, sumField } from "@/lib/records";
