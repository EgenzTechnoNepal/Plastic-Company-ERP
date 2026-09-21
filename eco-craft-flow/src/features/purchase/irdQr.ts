/**
 * Parse IRD-style tax invoice QR payloads locally (no cloud OCR / CBMS).
 * Accepts JSON or common delimited forms used on Nepal VAT invoices.
 */
export interface IrdQrFields {
  vendorPan: string;
  buyerPan: string;
  invoiceNo: string;
  date: string;
  amount: number;
  vat: number;
  fiscalYear: string;
  vendorName?: string;
  raw: string;
  confidence: number;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normalizeDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const dmy = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return t.slice(0, 10);
}

function fromObject(obj: Record<string, unknown>, raw: string): IrdQrFields {
  const vendorPan = s(obj.seller_pan ?? obj.sellerPan ?? obj.vendorPan ?? obj.pan ?? obj.PAN);
  const buyerPan = s(obj.buyer_pan ?? obj.buyerPan ?? obj.buyer_PAN);
  const invoiceNo = s(obj.invoice_number ?? obj.invoiceNo ?? obj.bill_no ?? obj.billNo ?? obj.invoice);
  const date = normalizeDate(s(obj.invoice_date ?? obj.date ?? obj.bill_date ?? obj.invoiceDate));
  const amount = n(obj.total_amount ?? obj.amount ?? obj.total ?? obj.grand_total ?? obj.extractedTotal);
  const vat = n(obj.tax_amount ?? obj.vat ?? obj.vat_amount ?? obj.tax);
  const fiscalYear = s(obj.fiscal_year ?? obj.fiscalYear ?? obj.fy);
  const vendorName = s(obj.seller_name ?? obj.vendor ?? obj.vendorName) || undefined;
  let confidence = 0.55;
  if (vendorPan && invoiceNo) confidence += 0.2;
  if (amount > 0) confidence += 0.15;
  if (date) confidence += 0.1;
  return {
    vendorPan,
    buyerPan,
    invoiceNo,
    date,
    amount,
    vat,
    fiscalYear,
    vendorName,
    raw,
    confidence: Math.min(0.99, confidence),
  };
}

/** Parse JSON or pipe/comma-delimited IRD-style QR text. */
export function parseIrdQrPayload(rawInput: string): IrdQrFields {
  const raw = rawInput.trim();
  if (!raw) {
    return {
      vendorPan: "",
      buyerPan: "",
      invoiceNo: "",
      date: "",
      amount: 0,
      vat: 0,
      fiscalYear: "",
      raw,
      confidence: 0,
    };
  }

  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      return fromObject(obj, raw);
    } catch {
      /* fall through */
    }
  }

  // Common: sellerPan|buyerPan|fiscalYear|invoiceNo|date|amount|vat
  const parts = raw.split(/[|,;\t]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const looksLikePan = (p: string) => /^\d{9}$/.test(p.replace(/\D/g, ""));
    let vendorPan = "";
    let buyerPan = "";
    let fiscalYear = "";
    let invoiceNo = "";
    let date = "";
    let amount = 0;
    let vat = 0;
    const pans = parts.filter(looksLikePan);
    vendorPan = pans[0] ?? "";
    buyerPan = pans[1] ?? "";
    for (const p of parts) {
      if (/^\d{4}[\/-]\d{2}$/.test(p) || /^\d{4}\/\d{2}$/.test(p)) fiscalYear = p;
      else if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(p) || /^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/.test(p)) {
        date = normalizeDate(p);
      } else if (/^\d+(\.\d+)?$/.test(p) && !looksLikePan(p)) {
        if (!amount) amount = n(p);
        else if (!vat) vat = n(p);
      } else if (!looksLikePan(p) && p !== fiscalYear && !invoiceNo && !/^\d+(\.\d+)?$/.test(p)) {
        invoiceNo = p;
      }
    }
    return fromObject(
      { vendorPan, buyerPan, fiscalYear, invoiceNo, date, amount, vat },
      raw,
    );
  }

  return fromObject({ invoiceNo: raw.slice(0, 40) }, raw);
}

export function irdFieldsToOcrPatch(fields: IrdQrFields): Record<string, unknown> {
  return {
    source: "QR Scan",
    pan: fields.vendorPan,
    buyerPan: fields.buyerPan,
    invoiceNo: fields.invoiceNo,
    invoiceDate: fields.date,
    extractedTotal: fields.amount,
    vat: fields.vat,
    fiscalYear: fields.fiscalYear,
    vendor: fields.vendorName ?? "",
    confidence: fields.confidence,
    matchStatus: "Pending",
    qrRaw: fields.raw.slice(0, 2000),
  };
}
