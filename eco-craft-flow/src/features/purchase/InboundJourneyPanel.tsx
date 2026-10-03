import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, CircleAlert, CircleDot, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastApiError } from "@/services/api/client";
import { qcPassInspection } from "@/services/api/phase2";
import {
  inboundJourneyKey,
  postLotLandedCost,
  putawayLot,
  qcFailLot,
  receiveAgainstGate,
  recordGateEntry,
  useInboundJourney,
  type InboundJourney,
  type JourneyLot,
} from "@/services/api/inboundJourney";

type StageState = "done" | "current" | "blocked" | "failed" | "todo";

const HOLDING_BIN_TYPES = new Set(["RECEIVING", "QC_HOLD"]);

function qty(value: string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value ?? "");
}

function money(value: string | null | undefined, currency: string) {
  const n = Number(value ?? 0);
  const text = Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value ?? "");
  return `${currency} ${text}`.trim();
}

function statusTone(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toUpperCase();
  if (["AVAILABLE", "POSTED", "PASSED", "DOCS_CLEARED", "LINKED_TO_GRN", "RECEIVED", "ACCEPTED"].includes(s)) return "default";
  if (["REJECTED", "QUARANTINED", "FAILED", "CANCELLED", "DOCS_BLOCKED", "AI_MATCH_FAILED"].includes(s)) return "destructive";
  if (["QC_HOLD", "SUBMITTED", "DRAFT", "PARTIALLY_RECEIVED", "MANUFACTURING", "DOCS_PENDING"].includes(s)) return "secondary";
  return "outline";
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge variant={statusTone(status)}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (state === "failed" || state === "blocked") return <CircleAlert className="h-4 w-4 text-destructive" />;
  if (state === "current") return <CircleDot className="h-4 w-4 text-amber-600" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function Stage({ n, title, state, children }: { n: number; title: string; state: StageState; children: ReactNode }) {
  return (
    <Card className="rounded-2xl border-border/60" data-stage={title}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StageIcon state={state} />
          <span className="text-muted-foreground">{n}.</span> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function stageStates(j: InboundJourney): StageState[] {
  const po = ["APPROVED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(j.purchase_order.status)
    ? "done"
    : "current";
  const lc: StageState = j.lc_gate.lc_gate_allowed ? "done" : "blocked";
  const gate: StageState = j.gates.some((g) => g.status === "LINKED_TO_GRN")
    ? "done"
    : j.gates.some((g) => g.status === "SUBMITTED")
      ? "current"
      : j.actions.gate_blocked_by_lc
        ? "blocked"
        : "todo";
  const grn: StageState = j.grns.some((g) => g.status === "POSTED") ? "done" : gate === "current" ? "current" : "todo";
  const lots = j.lots;
  const qc: StageState = lots.some((l) => l.status === "AVAILABLE")
    ? "done"
    : lots.some((l) => l.status === "QUARANTINED" || l.status === "REJECTED")
      ? "failed"
      : lots.some((l) => l.status === "QC_HOLD")
        ? "current"
        : "todo";
  const landed: StageState = lots.some((l) => l.landed_unit_cost)
    ? "done"
    : lots.some((l) => l.actions.can_landed_cost)
      ? "current"
      : "todo";
  const available: StageState = lots.some(
    (l) => l.status === "AVAILABLE" && l.bin && !HOLDING_BIN_TYPES.has(l.bin.type),
  )
    ? "done"
    : lots.some((l) => l.actions.can_putaway)
      ? "current"
      : "todo";
  return [po, lc, gate, grn, qc, landed, available];
}

function useJourneyAction(poId: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: inboundJourneyKey(poId) });
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  };
  return { busy, run };
}

function GateStage({ j, run, busy }: { j: InboundJourney; run: ReturnType<typeof useJourneyAction>["run"]; busy: string | null }) {
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const canTry = j.actions.can_record_gate || j.actions.gate_blocked_by_lc;
  return (
    <>
      {j.gates.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gate entry</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {j.gates.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.number}</TableCell>
                <TableCell>{g.vehicle_number || "—"}</TableCell>
                <TableCell>{g.driver_name || "—"}</TableCell>
                <TableCell>
                  <StatusPill status={g.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {j.actions.gate_blocked_by_lc && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          LC gate closed: {j.actions.gate_blocked_reason}
        </p>
      )}
      {canTry && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="gate-vehicle">Vehicle number</Label>
            <Input id="gate-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. Ko 2 Kha 1357" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gate-driver">Driver</Label>
            <Input id="gate-driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant={j.actions.can_record_gate ? "default" : "outline"}
            disabled={busy !== null || !vehicle.trim()}
            onClick={() =>
              run(
                "gate",
                () => recordGateEntry({ purchase_order: j.purchase_order.id, vehicle_number: vehicle, driver_name: driver }),
                "Gate entry recorded — LC gate passed",
              )
            }
          >
            {busy === "gate" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {j.actions.can_record_gate ? "Record gate entry" : "Attempt gate entry"}
          </Button>
        </div>
      )}
      {!canTry && j.gates.length === 0 && <p className="text-muted-foreground">No gate entry expected for this PO right now.</p>}
    </>
  );
}

function GrnStage({ j, run, busy }: { j: InboundJourney; run: ReturnType<typeof useJourneyAction>["run"]; busy: string | null }) {
  const gateId = j.actions.receivable_gate_ids[0];
  const receivable = j.purchase_order.lines.filter((l) => Number(l.remaining_receivable) > 0);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  useEffect(() => {
    setQtys(Object.fromEntries(receivable.map((l) => [l.id, l.remaining_receivable])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateId]);
  return (
    <>
      {gateId && receivable.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">
            Receiving puts stock in the QC hold bin. It is not available until QC passes.
          </p>
          {receivable.map((l) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_160px] sm:items-end">
              <div>
                <p className="font-medium">
                  {l.item_sku} · {l.item_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Remaining {qty(l.remaining_receivable)} {l.uom}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`grn-qty-${l.id}`}>Accepted ({l.uom})</Label>
                <Input
                  id={`grn-qty-${l.id}`}
                  inputMode="decimal"
                  value={qtys[l.id] ?? ""}
                  onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run(
                "grn",
                () =>
                  receiveAgainstGate(
                    gateId,
                    receivable.map((l) => ({ purchase_order_line: l.id, accepted_quantity: qtys[l.id] ?? "" })),
                  ),
                "GRN posted — lot created in QC hold",
              )
            }
          >
            {busy === "grn" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Post GRN
          </Button>
        </div>
      )}
      {j.grns.length === 0 && !gateId && <p className="text-muted-foreground">Waiting for a submitted gate entry.</p>}
      {j.grns.map((g) => (
        <div key={g.id} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{g.number}</span>
            <StatusPill status={g.status} />
            <span className="text-xs text-muted-foreground">
              gate {g.gate_number ?? "—"} · warehouse {g.warehouse ?? "—"}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Lot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.lines.map((l, i) => (
                <TableRow key={`${g.id}-${i}`}>
                  <TableCell>{l.item_sku}</TableCell>
                  <TableCell className="text-right">{qty(l.accepted_quantity)}</TableCell>
                  <TableCell className="text-right">{qty(l.rejected_quantity)}</TableCell>
                  <TableCell className="text-right">{money(l.purchase_unit_cost, j.purchase_order.currency)}</TableCell>
                  <TableCell>{l.lot_number}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </>
  );
}

function LotQc({ lot, run, busy }: { lot: JourneyLot; run: ReturnType<typeof useJourneyAction>["run"]; busy: string | null }) {
  const [coa, setCoa] = useState("");
  const inspectionId = lot.actions.qc_inspection_id;
  return (
    <div className="space-y-2">
      {lot.inspections.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{i.number}</span>
          <StatusPill status={i.status} />
          {i.fail_disposition && <StatusPill status={i.fail_disposition} />}
          {i.coa_reference && <span className="text-xs text-muted-foreground">CoA {i.coa_reference}</span>}
          {i.ncr_reference && <span className="text-xs text-destructive">NCR {i.ncr_reference}</span>}
        </div>
      ))}
      {inspectionId && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`coa-${lot.id}`}>CoA reference</Label>
            <Input id={`coa-${lot.id}`} value={coa} onChange={(e) => setCoa(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run(`qc-pass-${lot.id}`, () => qcPassInspection(inspectionId, { coa_reference: coa }), "QC passed — lot AVAILABLE")
            }
          >
            QC Pass
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => run(`qc-q-${lot.id}`, () => qcFailLot(inspectionId, "QUARANTINED"), "QC failed — lot QUARANTINED")}
          >
            Fail → Quarantine
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => run(`qc-r-${lot.id}`, () => qcFailLot(inspectionId, "REJECTED"), "QC failed — lot REJECTED")}
          >
            Fail → Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function LotLanded({
  lot,
  j,
  run,
  busy,
}: {
  lot: JourneyLot;
  j: InboundJourney;
  run: ReturnType<typeof useJourneyAction>["run"];
  busy: string | null;
}) {
  const currency = j.purchase_order.currency;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const entered = useMemo(
    () => Object.values(amounts).reduce((sum, v) => sum + (Number(v) > 0 ? Number(v) : 0), 0),
    [amounts],
  );
  return (
    <div className="space-y-3">
      {lot.landed_costs.map((d) => (
        <div key={d.id} className="space-y-1 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{d.number}</span>
            <StatusPill status={d.status} />
          </div>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>
                  Supplier purchase value ({qty(d.purchase_quantity)} {lot.uom} × {money(d.purchase_unit_cost, currency)})
                </TableCell>
                <TableCell className="text-right">{money(d.purchase_value, currency)}</TableCell>
              </TableRow>
              {d.components.map((c, i) => (
                <TableRow key={`${d.id}-${i}`}>
                  <TableCell className="pl-6 text-muted-foreground">+ {c.label}</TableCell>
                  <TableCell className="text-right">{money(c.amount, currency)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Landed total</TableCell>
                <TableCell className="text-right font-semibold">{money(d.landed_total, currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ))}
      {lot.actions.can_landed_cost && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">
            Enter the import costs for this lot. The supplier price stays at {money(lot.purchase_unit_cost, currency)}/{lot.uom};
            the server computes the landed unit cost.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {j.landed_cost_categories.map((c) => (
              <div key={c.value} className="space-y-1">
                <Label htmlFor={`lc-${lot.id}-${c.value}`}>{c.label}</Label>
                <Input
                  id={`lc-${lot.id}-${c.value}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={amounts[c.value] ?? ""}
                  onChange={(e) => setAmounts((p) => ({ ...p, [c.value]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={busy !== null || entered <= 0}
              onClick={() =>
                run(
                  `landed-${lot.id}`,
                  () =>
                    postLotLandedCost(
                      lot.id,
                      Object.entries(amounts)
                        .filter(([, v]) => Number(v) > 0)
                        .map(([category, amount]) => ({ category, amount })),
                    ),
                  "Landed cost posted",
                )
              }
            >
              Post landed cost
            </Button>
            <span className="text-xs text-muted-foreground">Additional costs entered: {money(String(entered), currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LotPutaway({
  lot,
  j,
  run,
  busy,
}: {
  lot: JourneyLot;
  j: InboundJourney;
  run: ReturnType<typeof useJourneyAction>["run"];
  busy: string | null;
}) {
  const [binId, setBinId] = useState(j.putaway_bins[0]?.id ?? "");
  return (
    <div className="space-y-2">
      {lot.putaways.map((p) => (
        <p key={p.number}>
          <span className="font-medium">{p.number}</span> · {qty(p.quantity)} {lot.uom} {p.from_bin ?? "—"} → {p.to_bin}{" "}
          <StatusPill status={p.status} />
        </p>
      ))}
      {lot.actions.can_putaway && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`put-${lot.id}`}>Storage bin</Label>
            <select
              id={`put-${lot.id}`}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={binId}
              onChange={(e) => setBinId(e.target.value)}
            >
              {j.putaway_bins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name || b.type}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={busy !== null || !binId}
            onClick={() => run(`put-${lot.id}`, () => putawayLot(lot.id, binId), "Putaway posted — stock in storage bin")}
          >
            Put away
          </Button>
        </div>
      )}
    </div>
  );
}

function LotLedger({ lot }: { lot: JourneyLot }) {
  if (lot.ledger.length === 0) return null;
  return (
    <details className="rounded-lg border border-border/60 p-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        Stock ledger for {lot.lot_number} ({lot.ledger.length} entries)
      </summary>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">In</TableHead>
            <TableHead className="text-right">Out</TableHead>
            <TableHead>Bin</TableHead>
            <TableHead className="text-right">Unit cost</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lot.ledger.map((e, i) => (
            <TableRow key={`${lot.id}-l-${i}`}>
              <TableCell className="whitespace-nowrap text-xs">{new Date(e.occurred_at).toLocaleString()}</TableCell>
              <TableCell className="text-xs">
                {e.txn_type}
                {e.is_state_event ? " (state)" : ""}
              </TableCell>
              <TableCell className="text-right">{qty(e.quantity_in)}</TableCell>
              <TableCell className="text-right">{qty(e.quantity_out)}</TableCell>
              <TableCell>{e.bin ?? "—"}</TableCell>
              <TableCell className="text-right">{qty(e.unit_cost)}</TableCell>
              <TableCell className="text-xs">{e.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}

function LotHeader({ lot, currency }: { lot: JourneyLot; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{lot.lot_number}</span>
      <StatusPill status={lot.status} />
      <span className="text-xs text-muted-foreground">
        {qty(lot.remaining_quantity)} {lot.uom} {lot.item_sku} · {lot.warehouse ?? "—"} / {lot.bin?.code ?? "—"} ({lot.bin?.type ?? "—"})
      </span>
      <span className="text-xs text-muted-foreground">
        purchase {money(lot.purchase_unit_cost, currency)}/{lot.uom}
        {lot.landed_unit_cost ? ` · landed ${money(lot.landed_unit_cost, currency)}/${lot.uom}` : ""}
      </span>
    </div>
  );
}

/** Live, server-driven inbound journey for one typed purchase order. */
export function InboundJourneyPanel({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { data: j, error, isLoading, refetch, isFetching } = useInboundJourney(purchaseOrderId);
  const { busy, run } = useJourneyAction(purchaseOrderId);

  if (isLoading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading inbound journey…</p>;
  if (error || !j) {
    return (
      <Card className="rounded-2xl border-destructive/40">
        <CardContent className="space-y-2 py-4 text-sm">
          <p className="text-destructive">Could not load the inbound journey: {error instanceof Error ? error.message : "unknown error"}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const po = j.purchase_order;
  const lc = j.letter_of_credit;
  const states = stageStates(j);
  const cur = po.currency;

  return (
    <div className="space-y-4" data-testid="inbound-journey">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inbound journey</h2>
        <span className="text-xs text-muted-foreground">{isFetching ? "Refreshing…" : "Live from server"}</span>
      </div>

      <Stage n={1} title="Purchase order" state={states[0]}>
        <Facts
          items={[
            ["Supplier", `${po.supplier.name} (${po.supplier.code})`],
            ["Country", po.supplier.country],
            ["Status", <StatusPill key="s" status={po.status} />],
            ["Currency", po.currency],
            ["Payment terms", po.payment_terms],
            ["Incoterm", [po.incoterm, po.named_place].filter(Boolean).join(" ")],
            ["Destination warehouse", po.destination_warehouse ?? ""],
            ["Expected delivery", po.expected_delivery_date ?? ""],
            ["PO total", money(po.total, cur)],
          ]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Tax %</TableHead>
              <TableHead className="text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <span className="font-medium">{l.item_sku}</span> · {l.item_name}
                </TableCell>
                <TableCell className="text-right">
                  {qty(l.ordered_quantity)} {l.uom}
                </TableCell>
                <TableCell className="text-right">{qty(l.received_quantity)}</TableCell>
                <TableCell className="text-right">{qty(l.remaining_receivable)}</TableCell>
                <TableCell className="text-right">{money(l.unit_price, cur)}</TableCell>
                <TableCell className="text-right">{qty(l.tax_pct)}</TableCell>
                <TableCell className="text-right">{money(l.line_total, cur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Stage>

      <Stage n={2} title="Proforma invoice & letter of credit" state={states[1]}>
        {j.proforma_invoices.map((pi) => (
          <p key={pi.id}>
            <span className="font-medium">{pi.number}</span> (seller ref {pi.seller_pi_number || "—"}) ·{" "}
            {money(pi.total_amount, pi.currency_code)} · {pi.payment_terms} <StatusPill status={pi.status} />
          </p>
        ))}
        {lc ? (
          <>
            <Facts
              items={[
                ["LC", lc.number],
                ["Status", <StatusPill key="lc" status={lc.status} label={lc.status_label} />],
                ["Bank", lc.bank_name],
                ["Final LC number", lc.final_lc_number],
                ["Amount", money(lc.amount, lc.currency_code)],
                [
                  "PO ↔ PI ↔ LC check",
                  lc.match.passed == null
                    ? "Not run"
                    : `${lc.match.passed ? "Passed" : "Failed"} (rules-based check ${lc.match.engine})`,
                ],
              ]}
            />
            {lc.match.issues.length > 0 && (
              <ul className="list-disc pl-5 text-destructive">
                {lc.match.issues.map((issue, i) => (
                  <li key={i}>{typeof issue === "string" ? issue : JSON.stringify(issue)}</li>
                ))}
              </ul>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Pre-dispatch document checklist</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {lc.checklist.map((item) => (
                  <li key={item.key} className="flex items-center gap-2">
                    {item.present_in_packet ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className={`h-4 w-4 ${item.required ? "text-destructive" : "text-muted-foreground"}`} />
                    )}
                    {item.label}
                    {item.required ? <span className="text-xs text-muted-foreground">(required)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">No letter of credit on this PO (domestic purchase).</p>
        )}
        <p
          className={`rounded-lg px-3 py-2 ${j.lc_gate.lc_gate_allowed ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}
        >
          LC gate: {j.lc_gate.lc_gate_allowed ? "open" : "closed"}
          {j.lc_gate.lc_gate_message ? ` — ${j.lc_gate.lc_gate_message}` : ""}
        </p>
      </Stage>

      <Stage n={3} title="Gate entry" state={states[2]}>
        <GateStage j={j} run={run} busy={busy} />
      </Stage>

      <Stage n={4} title="Goods receipt (GRN)" state={states[3]}>
        <GrnStage j={j} run={run} busy={busy} />
      </Stage>

      <Stage n={5} title="Quality control" state={states[4]}>
        {j.lots.length === 0 && <p className="text-muted-foreground">No lots received yet.</p>}
        {j.lots.map((lot) => (
          <div key={lot.id} className="space-y-2">
            <LotHeader lot={lot} currency={cur} />
            <LotQc lot={lot} run={run} busy={busy} />
          </div>
        ))}
      </Stage>

      <Stage n={6} title="Landed cost" state={states[5]}>
        {j.lots.length === 0 && <p className="text-muted-foreground">Landed cost is posted per received lot.</p>}
        {j.lots.map((lot) => (
          <div key={lot.id} className="space-y-2">
            <LotHeader lot={lot} currency={cur} />
            <LotLanded lot={lot} j={j} run={run} busy={busy} />
          </div>
        ))}
      </Stage>

      <Stage n={7} title="Available inventory" state={states[6]}>
        {j.lots.length === 0 && <p className="text-muted-foreground">Nothing received yet.</p>}
        {j.lots.map((lot) => (
          <div key={lot.id} className="space-y-2">
            <LotHeader lot={lot} currency={cur} />
            <LotPutaway lot={lot} j={j} run={run} busy={busy} />
            <LotLedger lot={lot} />
          </div>
        ))}
      </Stage>
    </div>
  );
}
