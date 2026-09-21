import { Factory, IndianRupee, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DataListPage, type Column } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { npr } from "@/lib/export";
import { statusLabel, statusTone, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { woCosting } from "@/features/production/cycle";
import { useRecords } from "@/services/entityService";

export function CostingPage() {
  const orders = useRecords("work_orders");
  const rows = orders.map((wo) => {
    const cost = woCosting(wo);
    return { wo, cost };
  });
  const over = rows.filter((r) => r.cost.variance > 0).length;
  const totalVar = rows.reduce((s, r) => s + r.cost.variance, 0);

  const columns: Array<Column<(typeof rows)[number]>> = [
    {
      key: "wo",
      header: "Work order",
      cell: (r) => (
        <Link to={recordPath("work_orders", r.wo.code) as never} className="hover:text-primary">
          <div className="font-mono text-xs">{r.wo.code}</div>
          <div className="text-xs text-muted-foreground">{str(r.wo, "product")}</div>
        </Link>
      ),
      value: (r) => r.wo.code,
    },
    { key: "std", header: "Standard", align: "right", cell: (r) => npr(r.cost.standard), value: (r) => r.cost.standard },
    { key: "act", header: "Actual", align: "right", cell: (r) => npr(r.cost.actual), value: (r) => r.cost.actual },
    { key: "mat", header: "Material", align: "right", cell: (r) => npr(r.cost.material), value: (r) => r.cost.material },
    { key: "lab", header: "Labour", align: "right", cell: (r) => npr(r.cost.labour), value: (r) => r.cost.labour },
    {
      key: "var",
      header: "Variance",
      align: "right",
      cell: (r) => <span className={r.cost.variance > 0 ? "font-semibold text-destructive" : "font-semibold text-primary"}>{npr(r.cost.variance)}</span>,
      value: (r) => r.cost.variance,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge tone={statusTone(r.wo.status)}>{statusLabel(r.wo.status)}</StatusBadge>, value: (r) => r.wo.status },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Work orders" value={rows.length} icon={Factory} />
        <KpiCard label="Over standard" value={over} icon={TrendingUp} accent="secondary" />
        <KpiCard label="Under / on std" value={rows.length - over} icon={TrendingDown} accent="accent" />
        <KpiCard label="Net variance" value={npr(totalVar)} icon={IndianRupee} accent="muted" />
      </div>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.wo.id}
        columns={columns}
        exportName="wo-costing"
        searchPlaceholder="Search work order…"
        search={(r, q) => r.wo.code.toLowerCase().includes(q) || str(r.wo, "product").toLowerCase().includes(q)}
        mobileCard={(r) => (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs">{r.wo.code}</div>
              <div className="text-xs text-muted-foreground">{str(r.wo, "product")}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{npr(r.cost.variance)}</div>
              <StatusBadge tone={statusTone(r.wo.status)}>{statusLabel(r.wo.status)}</StatusBadge>
            </div>
          </div>
        )}
      />
    </div>
  );
}
