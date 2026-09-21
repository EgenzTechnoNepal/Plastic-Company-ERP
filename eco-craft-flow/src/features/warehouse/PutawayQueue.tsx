import { toast } from "sonner";
import { PackageCheck, MapPin, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataListPage } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { putAwayGrn } from "@/features/warehouse/cycle";
import { recordPath } from "@/features/registry/paths";
import { num, searchRecord, str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export function PutawayQueue() {
  const grns = useRecords("grns");
  const rows = grns.filter((r) => str(r, "inspection") === "Passed" && str(r, "putawayStatus") !== "Put away");

  const run = async (row: (typeof rows)[0]) => {
    try {
      const next = await putAwayGrn(row);
      toast.success(`${next.code} put away to ${str(next, "putawayBin")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Put-away failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Waiting put-away" value={rows.length} icon={PackageCheck} />
        <KpiCard label="Qty" value={rows.reduce((s, r) => s + (num(r, "acceptedQty") || r.lines.reduce((a, l) => a + l.qty, 0)), 0).toLocaleString("en-IN")} icon={Warehouse} accent="secondary" />
        <KpiCard label="Warehouses" value={new Set(rows.map((r) => str(r, "warehouse"))).size} icon={MapPin} accent="muted" />
      </div>
      <DataListPage
        rows={rows}
        rowKey={(r) => r.id}
        exportName="putaway-queue"
        emptyMessage="Nothing waiting. Passed GRNs land here until they are binned."
        search={(row, q) => searchRecord(row, q, ["code", "title", "fields.supplierName", "fields.warehouse"])}
        searchPlaceholder="Search GRNs…"
        rowHref={(row) => recordPath("grns", row.code)}
        columns={[
          { key: "code", header: "GRN", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, value: (r) => r.code },
          { key: "supplier", header: "Supplier", cell: (r) => str(r, "supplierName") || r.title, value: (r) => str(r, "supplierName") },
          { key: "wh", header: "Warehouse", cell: (r) => str(r, "warehouse"), value: (r) => str(r, "warehouse") },
          { key: "qty", header: "Accepted", align: "right", cell: (r) => (num(r, "acceptedQty") || r.lines.reduce((s, l) => s + l.qty, 0)).toLocaleString("en-IN"), value: (r) => num(r, "acceptedQty") },
          { key: "insp", header: "QC", cell: () => <StatusBadge tone="success">Passed</StatusBadge>, value: () => "Passed" },
          {
            key: "action",
            header: "",
            cell: (r) => (
              <PermissionGuard action="create">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(r);
                  }}
                >
                  Put away
                </Button>
              </PermissionGuard>
            ),
          },
        ]}
      />
    </div>
  );
}
