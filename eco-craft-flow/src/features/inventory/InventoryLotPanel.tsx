import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { statusLabel } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => row != null && typeof row === "object" && !Array.isArray(row)) : [];
}

function text(value: unknown): string {
  if (value == null || value === "") return "-";
  return String(value);
}

function qty(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : text(value);
}

function lotTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "AVAILABLE") return "success";
  if (status === "QC_HOLD") return "warning";
  if (status === "QUARANTINED") return "info";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export function InventoryLotPanel({ record }: { record: ErpRecord }) {
  const layers = asRows(record.fields.receiptLayers);
  const ledger = asRows(record.fields.stockLedger);
  const putaways = asRows(record.fields.putaways);
  const lotStatus = text(record.fields.lotStatus);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inventory Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Lot status</div>
            <StatusBadge tone={lotTone(lotStatus)}>{statusLabel(lotStatus)}</StatusBadge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">QC status</div>
            <div className="font-medium">{text(record.fields.qcStatus)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Warehouse</div>
            <div className="font-mono text-xs">{text(record.fields.warehouse)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Bin</div>
            <div className="font-mono text-xs">{text(record.fields.bin)}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Receipt Layers</CardTitle>
        </CardHeader>
        <CardContent>
          {layers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipt layers returned for this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2">Received</th>
                    <th>Sequence</th>
                    <th className="text-right">Initial</th>
                    <th className="text-right">Remaining</th>
                    <th className="text-right">Reserved</th>
                    <th>Warehouse</th>
                    <th>Bin</th>
                    <th>QC</th>
                  </tr>
                </thead>
                <tbody>
                  {layers.map((row) => (
                    <tr key={text(row.id)} className="border-t">
                      <td className="py-2">{text(row.received_at)}</td>
                      <td>{text(row.receipt_sequence)}</td>
                      <td className="text-right">{qty(row.initial_quantity)}</td>
                      <td className="text-right">{qty(row.remaining_quantity)}</td>
                      <td className="text-right">{qty(row.reserved_quantity)}</td>
                      <td className="font-mono text-xs">{text(row.warehouse)}</td>
                      <td className="font-mono text-xs">{text(row.bin)}</td>
                      <td>{text(row.qc_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stock Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock ledger entries returned for this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2">Occurred</th>
                    <th>Type</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th>Warehouse</th>
                    <th>Bin</th>
                    <th>Reference</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={text(row.id)} className="border-t">
                      <td className="py-2">{text(row.occurred_at ?? row.created_at)}</td>
                      <td>{text(row.txn_type)}</td>
                      <td className="text-right">{qty(row.quantity_in)}</td>
                      <td className="text-right">{qty(row.quantity_out)}</td>
                      <td className="font-mono text-xs">{text(row.warehouse)}</td>
                      <td className="font-mono text-xs">{text(row.bin)}</td>
                      <td>{[row.reference_type, row.reference_id].filter(Boolean).join(" ") || "-"}</td>
                      <td>{text(row.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Putaway</CardTitle>
        </CardHeader>
        <CardContent>
          {putaways.length === 0 ? (
            <p className="text-sm text-muted-foreground">No putaway orders returned for this lot.</p>
          ) : (
            <div className="space-y-2">
              {putaways.map((row) => (
                <div key={text(row.id)} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="font-mono text-xs text-muted-foreground">{text(row.putaway_number ?? row.id)}</div>
                  <div className="mt-1 grid gap-2 sm:grid-cols-4">
                    <span>Qty: {qty(row.quantity)}</span>
                    <span>From: {text(row.from_bin)}</span>
                    <span>To: {text(row.to_bin)}</span>
                    <span>Status: {statusLabel(text(row.status))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
