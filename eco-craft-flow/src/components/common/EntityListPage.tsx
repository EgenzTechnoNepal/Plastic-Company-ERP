import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataListPage, type ListFilter } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { getEntity } from "@/features/registry/entities";
import { npr } from "@/lib/export";
import { getField, num, searchRecord, statusLabel, statusTone, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { recordTotal, useRecords, useRecordsStatus } from "@/services/entityService";
import { M2_TYPED_DETAIL_ENTITIES } from "@/services/api/typedEntities";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import type { ErpRecord } from "@/types/erp";
import type { TypedListQuery } from "@/services/api/m2Typed";

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

const PROCUREMENT_SEARCH_ENTITIES = new Set(["purchase_orders", "shipments", "gate_entries", "grns"]);
const SERVER_SEARCH_ENTITIES = new Set([
  ...PROCUREMENT_SEARCH_ENTITIES,
  "qc_inspections",
  "landed_cost_documents",
  "inventory_lots",
  "stock_movements",
]);

const PROCUREMENT_FILTERS: Record<
  string,
  Array<{
    key: keyof TypedListQuery | "active";
    placeholder: string;
    options: "status" | "supplier" | "purchase_order" | "sales_order" | "warehouse" | "active" | "txn_type";
  }>
> = {
  purchase_orders: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
  ],
  proforma_invoices: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
    { key: "purchase_order", placeholder: "All POs", options: "purchase_order" },
  ],
  letters_of_credit: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
    { key: "purchase_order", placeholder: "All POs", options: "purchase_order" },
  ],
  shipments: [
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
    { key: "active", placeholder: "All activity", options: "active" },
  ],
  gate_entries: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
  ],
  grns: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
    { key: "warehouse", placeholder: "All warehouses", options: "warehouse" },
  ],
  qc_inspections: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  landed_cost_documents: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  inventory_lots: [
    { key: "status", placeholder: "All lot status", options: "status" },
    { key: "supplier", placeholder: "All suppliers", options: "supplier" },
    { key: "warehouse", placeholder: "All warehouses", options: "warehouse" },
  ],
  stock_movements: [
    { key: "txn_type", placeholder: "All transaction types", options: "txn_type" },
    { key: "warehouse", placeholder: "All warehouses", options: "warehouse" },
  ],
  stock_reservations: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  stock_transfers: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  putaways: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  sales_orders: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
  deliveries: [
    { key: "status", placeholder: "All status", options: "status" },
    { key: "sales_order", placeholder: "All sales orders", options: "sales_order" },
  ],
  invoices: [
    { key: "status", placeholder: "All status", options: "status" },
  ],
};

const PROCUREMENT_STATUSES: Record<string, string[]> = {
  purchase_orders: ["DRAFT", "SUBMITTED", "APPROVED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"],
  proforma_invoices: ["DRAFT", "RECEIVED", "ACCEPTED", "SUPERSEDED", "CANCELLED"],
  letters_of_credit: [
    "DRAFT",
    "DRAFT_LC_SCANNED",
    "AI_MATCH_FAILED",
    "AI_MATCH_PASSED",
    "SELLER_APPROVED",
    "FINAL_ISSUED",
    "MANUFACTURING",
    "DOCS_PENDING",
    "DOCS_CLEARED",
    "DOCS_BLOCKED",
    "CLOSED",
    "CANCELLED",
  ],
  gate_entries: ["DRAFT", "SUBMITTED", "LINKED_TO_GRN", "CANCELLED"],
  grns: ["DRAFT", "POSTED", "CANCELLED"],
  qc_inspections: ["DRAFT", "PASSED", "FAILED"],
  landed_cost_documents: ["DRAFT", "PREVIEWED", "POSTED", "CANCELLED"],
  inventory_lots: ["RECEIVED", "QC_HOLD", "AVAILABLE", "QUARANTINED", "REJECTED", "CONSUMED", "EXPIRED"],
  stock_reservations: ["OPEN", "RELEASED", "CANCELLED"],
  stock_transfers: ["DRAFT", "POSTED"],
  putaways: ["DRAFT", "POSTED"],
  sales_orders: ["DRAFT", "CONFIRMED", "PARTIALLY_RESERVED", "RESERVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_INVOICED", "INVOICED", "COMPLETED", "CANCELLED"],
  deliveries: ["DRAFT", "POSTED", "CANCELLED"],
  invoices: ["DRAFT", "POSTED", "CANCELLED"],
};

const INVENTORY_TXN_TYPES = [
  "GRN_RECEIPT",
  "QC_RELEASE",
  "QC_REJECT",
  "PUTAWAY",
  "PUTAWAY_OUT",
  "PUTAWAY_IN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "RESERVATION",
  "RESERVATION_RELEASE",
  "ISSUE",
  "ISSUE_RETURN",
  "LANDED_COST_REVALUE",
];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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

export function EntityListPage(props: EntityListPageProps) {
  const live = useAuthStore((s) => s.source === "api");
  if (live && PROCUREMENT_FILTERS[props.entity]) return <ProcurementServerListPage {...props} />;
  return <GenericEntityListPage {...props} />;
}

function GenericEntityListPage({ entity, kpis, filter, extraFilters = [], exportName }: EntityListPageProps) {
  const def = getEntity(entity);
  const all = useRecords(entity);
  const status = useRecordsStatus(entity);
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
      {status.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>
            Could not load {def.label.toLowerCase()} from the server: {status.error}
          </span>
          <Button size="sm" variant="outline" onClick={status.retry}>
            Retry
          </Button>
        </div>
      )}
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName={exportName ?? entity}
        emptyMessage={
          status.loading
            ? `Loading ${def.label.toLowerCase()}…`
            : status.error
              ? `${def.label} unavailable — see the error above.`
              : `No ${def.label.toLowerCase()} match your filters.`
        }
        searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
        search={(r, q) => searchRecord(r, q, searchKeys)}
        rowHref={(r) => recordPath(entity, M2_TYPED_DETAIL_ENTITIES.has(entity) ? r.id : r.code)}
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

function ProcurementServerListPage({ entity, kpis, filter, exportName }: EntityListPageProps) {
  const def = getEntity(entity);
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<Record<string, string>>({});
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const suppliers = useRecords("suppliers");
  const purchaseOrders = useRecords("purchase_orders");
  const salesOrders = useRecords("sales_orders");
  const warehouses = useRecords("warehouses");
  const apiQuery = useMemo<TypedListQuery>(() => {
    const next: TypedListQuery = {};
    if (SERVER_SEARCH_ENTITIES.has(entity) && debouncedQuery) next.search = debouncedQuery;
    for (const [key, value] of Object.entries(filterState)) {
      if (!value || value === "all") continue;
      if (key === "active") next.is_active = value;
      else (next as Record<string, string>)[key] = value;
    }
    return next;
  }, [entity, debouncedQuery, filterState]);

  const all = useRecords(entity, apiQuery);
  const status = useRecordsStatus(entity, undefined, apiQuery);
  const rows = filter ? all.filter(filter) : all;
  if (!def) return <p className="text-sm text-muted-foreground">Unknown entity: {entity}</p>;

  const kpiItems = typeof kpis === "function" ? kpis(rows) : kpis;
  const filters: Array<ListFilter<ErpRecord>> = (PROCUREMENT_FILTERS[entity] ?? []).map((item) => {
    const options =
      item.options === "status"
        ? (PROCUREMENT_STATUSES[entity] ?? []).map((s) => ({ value: s, label: statusLabel(s) }))
        : item.options === "supplier"
          ? suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.title}` }))
          : item.options === "purchase_order"
            ? purchaseOrders.map((po) => ({ value: po.id, label: `${po.code} - ${po.title}` }))
            : item.options === "sales_order"
              ? salesOrders.map((so) => ({ value: so.id, label: `${so.code} - ${so.title}` }))
            : item.options === "warehouse"
              ? warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.title}` }))
              : item.options === "txn_type"
                ? INVENTORY_TXN_TYPES.map((v) => ({ value: v, label: statusLabel(v) }))
              : [
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ];
    return {
      key: String(item.key),
      placeholder: item.placeholder,
      options,
      match: () => true,
    };
  });

  return (
    <div className="space-y-6">
      {kpiItems && kpiItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpiItems.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} hint={k.hint} icon={k.icon} accent={k.accent} />
          ))}
        </div>
      )}
      {status.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span>
            Could not load {def.label.toLowerCase()} from the server: {status.error}
          </span>
          <Button size="sm" variant="outline" onClick={status.retry}>
            Retry
          </Button>
        </div>
      )}
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName={exportName ?? entity}
        emptyMessage={
          status.loading
            ? `Loading ${def.label.toLowerCase()}…`
            : status.error
              ? `${def.label} unavailable — see the error above.`
              : `No ${def.label.toLowerCase()} match your filters.`
        }
        searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
        search={SERVER_SEARCH_ENTITIES.has(entity) ? () => true : undefined}
        searchValue={query}
        onSearchChange={setQuery}
        filters={filters}
        filterValues={filterState}
        onFilterChange={(key, value) => setFilterState((s) => ({ ...s, [key]: value }))}
        serverFiltered
        rowHref={(r) => recordPath(entity, M2_TYPED_DETAIL_ENTITIES.has(entity) ? r.id : r.code)}
        auditModule={def.module}
        auditEntity={entity}
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
