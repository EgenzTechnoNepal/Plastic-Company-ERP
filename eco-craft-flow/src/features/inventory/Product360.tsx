import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { abcAnalysis, ageingClass, alertSeverity, availableQty, daysIdle, fifoLayers, lastMoveDate, movementLedger } from "@/features/inventory/analytics";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { num, statusLabel, statusTone, str, stockValue } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

function RelatedTable({ title, rows, entity, extra }: { title: string; rows: ErpRecord[]; entity: string; extra?: (r: ErpRecord) => string }) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {rows.slice(0, 8).map((r) => (
          <Link
            key={r.id}
            to={recordPath(entity, r.code) as never}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
          >
            <span className="min-w-0 truncate">
              <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
              <span className="ml-2">{extra ? extra(r) : r.title}</span>
            </span>
            <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function matchesItem(row: ErpRecord, code: string) {
  if (str(row, "product") === code || str(row, "item") === code) return true;
  return row.lines?.some((l) => l.item === code) ?? false;
}

export function Product360({ product }: { product: ErpRecord }) {
  const movements = useRecords("stock_movements");
  const batches = useRecords("batches").filter((r) => str(r, "product") === product.code);
  const bins = useRecords("bins").filter((r) => str(r, "product") === product.code);
  const pos = useRecords("purchase_orders").filter((r) => matchesItem(r, product.code));
  const grns = useRecords("grns").filter((r) => matchesItem(r, product.code));
  const sos = useRecords("sales_orders").filter((r) => matchesItem(r, product.code));
  const wos = useRecords("work_orders").filter((r) => str(r, "product") === product.code);
  const holds = useRecords("quarantine").filter((r) => str(r, "product") === product.code && r.status === "hold");
  const dealers = useRecords("dealers");
  const consignment = bins.filter((b) => str(b, "warehouse") === "WH-CS").reduce((s, b) => s + num(b, "occupied"), 0)
    + dealers.reduce((s, d) => (str(d, "consignmentItem") === product.code ? s + num(d, "consignmentQty") : s), 0);

  const onHand = num(product, "onHand");
  const reserved = num(product, "reserved");
  const inTransit = num(product, "inTransit");
  const available = availableQty(product);
  const last = lastMoveDate(movements, product.code);
  const idle = daysIdle(last, product.date);
  const ledger = movementLedger(movements, product.code);
  const layers = fifoLayers(movements, product);
  const abc = abcAnalysis([product])[0];
  const serials = batches.flatMap((b) => String(b.fields.serials ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean));
  const expiring = batches.filter((b) => str(b, "expiry") && str(b, "expiry") < "2027-01-01");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">On hand</p>
          <p className="text-lg font-semibold">{onHand.toLocaleString("en-IN")} {str(product, "uom")}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Available (on hand − reserved)</p>
          <p className="text-lg font-semibold">{available.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Reserved / in-transit</p>
          <p className="text-lg font-semibold">{reserved.toLocaleString("en-IN")} / {inTransit.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Stock value · {str(product, "valuation", "WA")}</p>
          <p className="text-lg font-semibold">{npr(stockValue(product))}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusBadge tone={alertSeverity(product) === "OK" ? "success" : "danger"}>{alertSeverity(product)}</StatusBadge>
        <StatusBadge tone="info">ABC {str(product, "abcClass", abc?.suggested ?? "—")}</StatusBadge>
        <StatusBadge tone={ageingClass(idle) === "Fast" ? "success" : "warning"}>{ageingClass(idle)} · {idle}d idle</StatusBadge>
        {holds.length > 0 && <StatusBadge tone="danger">Quarantine {holds.reduce((s, h) => s + num(h, "qty"), 0).toLocaleString("en-IN")}</StatusBadge>}
        {consignment > 0 && <StatusBadge tone="info">Consignment {consignment.toLocaleString("en-IN")}</StatusBadge>}
        {str(product, "serialTracking") === "Yes" && <StatusBadge tone="neutral">Serial tracked</StatusBadge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Reorder {num(product, "reorderLevel").toLocaleString("en-IN")} · safety {num(product, "safetyStock").toLocaleString("en-IN")} · MOQ {num(product, "moq").toLocaleString("en-IN")}
        {num(product, "maxStock") ? ` · max ${num(product, "maxStock").toLocaleString("en-IN")}` : ""} · last move {last || "—"}
      </p>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">FIFO / WA layers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {layers.length === 0 && <p className="text-muted-foreground">No receipt layers.</p>}
          {layers.map((l) => (
            <div key={`${l.ref}-${l.date}`} className="flex justify-between gap-2 rounded-lg border px-3 py-2">
              <span>{l.date} · {l.ref}</span>
              <span>{l.qty.toLocaleString("en-IN")} @ {npr(l.rate)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stock ledger (running balance)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ledger.length === 0 && <p className="text-muted-foreground">No movements yet.</p>}
          {ledger.slice(-8).map((row) => (
            <div key={row.movement.id} className="flex justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-mono text-xs">{row.movement.code}</span>
                <span className="ml-2">{str(row.movement, "type")} · {row.movement.date}</span>
              </span>
              <span>{row.qty > 0 ? "+" : ""}{row.qty.toLocaleString("en-IN")} → {row.balance.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <RelatedTable title="Locations (bins)" rows={bins} entity="bins" extra={(r) => `${str(r, "warehouse")} · occ ${num(r, "occupied").toLocaleString("en-IN")}`} />
      <RelatedTable title="Batches / expiry" rows={batches} entity="batches" extra={(r) => `exp ${str(r, "expiry") || "—"} · ${str(r, "qcStatus")}`} />
      {(serials.length > 0 || expiring.length > 0) && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Serials & near-expiry</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {serials.length > 0 && <p>Serials: {serials.slice(0, 8).join(", ")}</p>}
            {expiring.map((b) => (
              <p key={b.id}>{b.code} expires {str(b, "expiry")}</p>
            ))}
          </CardContent>
        </Card>
      )}
      <RelatedTable title="Purchase orders" rows={pos} entity="purchase_orders" extra={(r) => npr(recordTotal(r))} />
      <RelatedTable title="Goods receipts" rows={grns} entity="grns" extra={(r) => str(r, "inspection") || r.status} />
      <RelatedTable title="Sales orders" rows={sos} entity="sales_orders" extra={(r) => npr(recordTotal(r))} />
      <RelatedTable title="Work orders" rows={wos} entity="work_orders" extra={(r) => str(r, "plannedQty")} />
      <RelatedTable title="Quarantine holds" rows={holds} entity="quarantine" extra={(r) => `${num(r, "qty").toLocaleString("en-IN")} · ${str(r, "reason")}`} />
    </div>
  );
}
