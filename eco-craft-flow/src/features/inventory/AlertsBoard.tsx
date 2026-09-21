import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Boxes, IndianRupee, ShieldAlert, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { raisePrFromProduct } from "@/features/purchase/cycle";
import {
  alertKind,
  findWarehousePlan,
  isPlanningAlert,
  planningParams,
  reorderQty,
} from "@/features/inventory/planning";
import { availableQty } from "@/features/inventory/analytics";
import { recordPath } from "@/features/registry/paths";
import { downloadDoc, downloadPdfHtml, downloadXls, rowsToHtmlTable } from "@/lib/export";
import { num, searchRecord, stockValue, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

interface AlertRow {
  product: ErpRecord;
  plan?: ErpRecord;
  kind: ReturnType<typeof alertKind>;
}

function buildAlertRows(products: ErpRecord[], plans: ErpRecord[]): AlertRow[] {
  const rows: AlertRow[] = [];
  for (const product of products) {
    const wh = str(product, "warehouse");
    const plan = findWarehousePlan(product.code, wh) ?? plans.find((p) => str(p, "product") === product.code);
    const kind = alertKind(product, plan);
    if (kind !== "OK") rows.push({ product, plan, kind });
  }
  return rows;
}

function severityTone(kind: AlertRow["kind"]) {
  if (kind === "Stock-out" || kind === "Below MOQ") return "danger" as const;
  if (kind === "Over-stock") return "warning" as const;
  return "warning" as const;
}

export function AlertsBoard() {
  const navigate = useNavigate();
  const products = useRecords("products");
  const plans = useRecords("warehouse_item_plans");
  const suppliers = useRecords("suppliers");
  const rows = buildAlertRows(products, plans);
  const recovered = products.filter((p) => str(p, "alertClosedAt") && !isPlanningAlert(p, findWarehousePlan(p.code)));

  const exportRows = rows.map(({ product, plan, kind }) => {
    const p = planningParams(product, plan);
    const sup = suppliers.find((s) => s.code === p.preferredSupplier);
    return {
      Severity: kind,
      SKU: product.code,
      Product: product.title,
      Warehouse: str(plan ?? product, "warehouse") || "—",
      Available: availableQty(product),
      "On Hand": num(product, "onHand"),
      Reserved: num(product, "reserved"),
      "In Transit": num(product, "inTransit"),
      MOQ: p.moq,
      "Reorder Level": p.reorderLevel,
      "Reorder Qty": p.reorderQuantity,
      Shortfall: Math.max(0, p.reorderLevel - availableQty(product)),
      "Preferred Supplier": sup?.title ?? p.preferredSupplier,
      "Lead Time Days": p.leadTimeDays,
    };
  });

  const raise = async (row: AlertRow) => {
    try {
      const pr = await raisePrFromProduct(row.product, row.plan);
      toast.success(`${pr.code} drafted from alert`);
      navigate({ to: recordPath(pr.entity, pr.code) as never });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise PR");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Open alerts" value={rows.length} icon={AlertTriangle} />
        <KpiCard label="Below MOQ" value={rows.filter((r) => r.kind === "Below MOQ").length} icon={ShieldAlert} accent="muted" />
        <KpiCard label="Over-stock" value={rows.filter((r) => r.kind === "Over-stock").length} icon={TrendingUp} accent="secondary" />
        <KpiCard label="At risk value" value={`NPR ${rows.reduce((s, r) => s + stockValue(r.product), 0).toLocaleString("en-IN")}`} icon={IndianRupee} accent="secondary" />
        <KpiCard label="Auto-closed" value={recovered.length} icon={Boxes} accent="accent" hint="Stock recovered above threshold" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => downloadXls("moq-reorder-alerts", exportRows)}>
          Export Excel
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => downloadPdfHtml("MOQ & Reorder Alerts", rowsToHtmlTable(exportRows))}>
          Export PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadDoc("moq-reorder-alerts", "MOQ & Reorder Alerts", rowsToHtmlTable(exportRows))}
        >
          Export Word
        </Button>
      </div>

      <DataListPage
        rows={rows}
        rowKey={(r) => r.product.id}
        exportName="low-stock-alerts"
        auditModule="inventory"
        auditEntity="products"
        emptyMessage="No planning alerts. Thresholds: reorder level, MOQ, max stock."
        search={(row, q) => searchRecord(row.product, q, ["code", "title", "fields.type"])}
        searchPlaceholder="Search SKUs…"
        rowHref={(row) => recordPath("products", row.product.code)}
        columns={[
          { key: "code", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.product.code}</span>, value: (r) => r.product.code },
          { key: "name", header: "Product", cell: (r) => r.product.title, value: (r) => r.product.title },
          {
            key: "available",
            header: "Available",
            align: "right",
            cell: (r) => availableQty(r.product).toLocaleString("en-IN"),
            value: (r) => availableQty(r.product),
          },
          {
            key: "moq",
            header: "MOQ",
            align: "right",
            cell: (r) => planningParams(r.product, r.plan).moq.toLocaleString("en-IN"),
            value: (r) => planningParams(r.product, r.plan).moq,
          },
          {
            key: "reorder",
            header: "Reorder",
            align: "right",
            cell: (r) => planningParams(r.product, r.plan).reorderLevel.toLocaleString("en-IN"),
            value: (r) => planningParams(r.product, r.plan).reorderLevel,
          },
          {
            key: "reorderQty",
            header: "Reorder qty",
            align: "right",
            cell: (r) => reorderQty(r.product, r.plan).toLocaleString("en-IN"),
            value: (r) => reorderQty(r.product, r.plan),
          },
          {
            key: "supplier",
            header: "Preferred supplier",
            cell: (r) => {
              const code = planningParams(r.product, r.plan).preferredSupplier;
              const sup = suppliers.find((s) => s.code === code);
              return sup?.title ?? code ?? "—";
            },
          },
          {
            key: "severity",
            header: "Severity",
            cell: (r) => <StatusBadge tone={severityTone(r.kind)}>{r.kind}</StatusBadge>,
            value: (r) => r.kind,
          },
          {
            key: "action",
            header: "",
            cell: (r) =>
              r.kind !== "Over-stock" ? (
                <PermissionGuard action="create" module="inventory">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void raise(r);
                    }}
                  >
                    Convert to PR
                  </Button>
                </PermissionGuard>
              ) : null,
          },
        ]}
      />
      {recovered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Auto-closed after receipt: {recovered.map((r) => `${r.code} (${str(r, "alertClosedAt")})`).join(", ")}
        </p>
      )}
    </div>
  );
}
