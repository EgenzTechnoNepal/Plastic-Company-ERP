import { recordTotal } from "@/services/entityService";
import { STATUS_META, type DocStatus, type ErpRecord, type StatusTone } from "@/types/erp";

export function getField(r: ErpRecord, key: string): unknown {
  if (key === "code") return r.code;
  if (key === "title") return r.title;
  if (key === "status") return r.status;
  if (key === "date") return r.date;
  if (key === "total") return recordTotal(r);
  if (key.startsWith("fields.")) return r.fields[key.slice(7)];
  if (key in r.fields) return r.fields[key];
  return undefined;
}

export function str(r: ErpRecord, key: string, fallback = ""): string {
  const v = getField(r, key);
  if (v == null || v === "") return fallback;
  return String(v);
}

export function num(r: ErpRecord, key: string): number {
  const v = getField(r, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sumField(rows: ErpRecord[], key: string): number {
  return rows.reduce((s, r) => s + num(r, key), 0);
}

export function searchRecord(r: ErpRecord, query: string, keys: string[]): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  if (r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) return true;
  return keys.some((k) => str(r, k).toLowerCase().includes(q));
}

export function statusTone(status: string): StatusTone {
  return STATUS_META[status as DocStatus]?.tone ?? "neutral";
}

export function statusLabel(status: string): string {
  return STATUS_META[status as DocStatus]?.label ?? status.replace(/_/g, " ");
}

export function isLowStock(r: ErpRecord): boolean {
  const available = Math.max(0, num(r, "onHand") - num(r, "reserved") + num(r, "inTransit"));
  return available <= num(r, "reorderLevel");
}

export function stockValue(r: ErpRecord): number {
  return num(r, "onHand") * num(r, "rate");
}

export function invoiceBalance(r: ErpRecord): number {
  return Math.max(0, recordTotal(r) - num(r, "paid"));
}

export function pretty(value: string): string {
  return value.replace(/_/g, " ");
}

export function daysOverdue(dueDate: string, asOf = new Date()): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / 86_400_000));
}

export interface OutstandingRow {
  id: string;
  party: string;
  reference: string;
  dueDate: string;
  side: "receivable" | "payable";
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
}

export function buildOutstanding(invoices: ErpRecord[], bills: ErpRecord[]): OutstandingRow[] {
  const rec = invoices.map((r) => {
    const total = recordTotal(r);
    const paid = num(r, "paid");
    return {
      id: r.id,
      party: str(r, "customerName") || r.title,
      reference: r.code,
      dueDate: str(r, "dueDate"),
      side: "receivable" as const,
      total,
      paid,
      balance: Math.max(0, total - paid),
      daysOverdue: daysOverdue(str(r, "dueDate")),
    };
  });
  const pay = bills.map((r) => {
    const total = recordTotal(r);
    const paid = num(r, "paid");
    return {
      id: r.id,
      party: str(r, "supplierName") || r.title,
      reference: r.code,
      dueDate: str(r, "dueDate"),
      side: "payable" as const,
      total,
      paid,
      balance: Math.max(0, total - paid),
      daysOverdue: daysOverdue(str(r, "dueDate")),
    };
  });
  return [...rec, ...pay];
}