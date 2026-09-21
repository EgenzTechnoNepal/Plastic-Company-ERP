import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandMark";
import { LineItemTable } from "@/components/records/LineItemTable";
import { DualDate } from "@/components/common/DualDate";
import { npr } from "@/lib/export";
import { logAudit, recordTotal } from "@/services/entityService";
import { num, statusLabel, str } from "@/lib/records";
import { PermissionGuard } from "@/lib/permissions";
import type { EntityDef } from "@/features/registry/entities";
import type { ErpRecord } from "@/types/erp";

export function DocumentPreview({ record, def }: { record: ErpRecord; def: EntityDef }) {
  const isPayslip = record.entity === "payslips";
  const isVoucher = record.entity === "vouchers" || def.lines === "ledger";

  return (
    <Card className="rounded-2xl border-border/60 print:border-0 print:shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 print:hidden">
        <CardTitle className="text-base">Preview</CardTitle>
        {def.printable && (
          <PermissionGuard action="print" module={def.module}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                logAudit({ action: "print", module: def.module, entity: record.entity, recordId: record.id, recordCode: record.code });
                window.print();
              }}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </PermissionGuard>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <BrandLogo className="mb-2 h-10 w-auto max-w-[160px]" />
            <h2 className="text-lg font-semibold">{def.singular}</h2>
            <p className="font-mono text-xs text-muted-foreground">{record.code}</p>
          </div>
          <div className="text-right text-sm">
            <div>
              <DualDate value={record.date} />
            </div>
            <div className="text-muted-foreground">{statusLabel(record.status)}</div>
            <div className="mt-1 font-semibold">
              {isPayslip ? npr(num(record, "net")) : npr(recordTotal(record))}
            </div>
          </div>
        </div>
        <p className="font-medium">{record.title}</p>

        {isPayslip && (
          <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
            <Row label="Employee" value={str(record, "employeeName") || str(record, "employee")} />
            <Row label="Period" value={str(record, "period")} />
            <Row label="Basic" value={npr(num(record, "basic"))} />
            <Row label="Allowances" value={npr(num(record, "allowances"))} />
            <Row label="Overtime" value={npr(num(record, "overtime"))} />
            <Row label="SSF" value={npr(num(record, "ssf"))} />
            <Row label="CIT" value={npr(num(record, "cit"))} />
            <Row label="Tax" value={npr(num(record, "tax"))} />
            <Row label="Net pay" value={npr(num(record, "net"))} bold />
          </div>
        )}

        {isVoucher && str(record, "narration") && (
          <p className="text-sm text-muted-foreground">Narration: {str(record, "narration")}</p>
        )}

        {record.lines.length > 0 && (
          <LineItemTable lines={record.lines} onChange={() => undefined} mode={def.lines === "ledger" ? "ledger" : "items"} readOnly />
        )}
        <p className="text-[11px] text-muted-foreground">
          Simulated print preview — IRD/CBMS copy will attach when the backend is connected. Dates show AD with BS label.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}
