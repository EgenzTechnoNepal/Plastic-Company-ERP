import { num, str, stockValue } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

export function availableQty(product: ErpRecord) {
  return Math.max(0, num(product, "onHand") - num(product, "reserved") + num(product, "inTransit"));
}

export function alertSeverity(product: ErpRecord) {
  const onHand = num(product, "onHand");
  const available = availableQty(product);
  const reorder = num(product, "reorderLevel") || 1;
  const moq = num(product, "moq");
  const max = num(product, "maxStock");
  if (available <= 0) return "Stock-out";
  if (moq > 0 && available < moq) return "Below MOQ";
  if (onHand > 0 && max > 0 && onHand > max) return "Over-stock";
  if (available < reorder / 3) return "Critical";
  if (available <= reorder) return "Reorder";
  return "OK";
}

export function lastMoveDate(movements: ErpRecord[], productCode: string) {
  const rows = movements.filter((m) => str(m, "product") === productCode);
  if (!rows.length) return "";
  return rows.reduce((d, m) => (m.date > d ? m.date : d), rows[0].date);
}

export function daysIdle(lastDate: string, fallbackDate: string, asOf = new Date()) {
  const raw = lastDate || fallbackDate;
  if (!raw) return 0;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - d.getTime()) / 86_400_000));
}

export function ageingClass(days: number) {
  if (days <= 30) return "Fast";
  if (days <= 90) return "Slow-moving";
  return "Non-moving";
}

export interface LedgerLine {
  movement: ErpRecord;
  qty: number;
  balance: number;
}

export function movementLedger(movements: ErpRecord[], productCode: string): LedgerLine[] {
  const rows = movements
    .filter((m) => str(m, "product") === productCode)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  let balance = 0;
  return rows.map((movement) => {
    const qty = num(movement, "qty");
    balance += qty;
    return { movement, qty, balance };
  });
}

export interface AbcRow {
  product: ErpRecord;
  value: number;
  share: number;
  cumulative: number;
  suggested: "A" | "B" | "C";
  current: string;
}

export function abcAnalysis(products: ErpRecord[]): AbcRow[] {
  const ranked = products
    .map((product) => ({ product, value: stockValue(product) }))
    .sort((a, b) => b.value - a.value);
  const total = ranked.reduce((s, r) => s + r.value, 0) || 1;
  let cum = 0;
  return ranked.map((r) => {
    cum += r.value;
    const cumulative = cum / total;
    const suggested: AbcRow["suggested"] = cumulative <= 0.8 ? "A" : cumulative <= 0.95 ? "B" : "C";
    return {
      ...r,
      share: r.value / total,
      cumulative,
      suggested,
      current: str(r.product, "abcClass") || "—",
    };
  });
}

export interface FifoLayer {
  date: string;
  qty: number;
  ref: string;
  rate: number;
}

/** Remaining on-hand assigned to the newest receipts (oldest already issued). */
export function fifoLayers(movements: ErpRecord[], product: ErpRecord): FifoLayer[] {
  const receipts = movements
    .filter((m) => str(m, "product") === product.code && num(m, "qty") > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  let remaining = num(product, "onHand");
  const layers: FifoLayer[] = [];
  for (let i = receipts.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const qty = Math.min(num(receipts[i], "qty"), remaining);
    remaining -= qty;
    layers.unshift({
      date: receipts[i].date,
      qty,
      ref: str(receipts[i], "reference") || receipts[i].code,
      rate: num(product, "rate"),
    });
  }
  if (remaining > 0) {
    layers.unshift({ date: product.date, qty: remaining, ref: "Opening", rate: num(product, "rate") });
  }
  return layers;
}

/** @deprecated Use alertKind from planning.ts for warehouse-aware severity */
export function alertSeverityLegacy(product: ErpRecord) {
  return alertSeverity(product);
}
