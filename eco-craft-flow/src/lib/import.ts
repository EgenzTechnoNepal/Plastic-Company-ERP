/** Parse CSV / TSV / Excel-HTML exports for master-data import (no server). */

export type ImportRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === "\t") && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function tableFromHtml(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(tr[1]))) {
      cells.push(cell[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function matrixToObjects(matrix: string[][]): ImportRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeHeader);
  return matrix.slice(1).filter((r) => r.some((c) => c.trim())).map((row) => {
    const obj: ImportRow = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = (row[i] ?? "").trim();
    });
    return obj;
  });
}

export function parseDelimitedText(text: string): ImportRow[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  if (trimmed.includes("<table")) {
    return matrixToObjects(tableFromHtml(trimmed));
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  return matrixToObjects(lines.map(parseCsvLine));
}

export async function parseSpreadsheetFile(file: File): Promise<ImportRow[]> {
  const text = await file.text();
  return parseDelimitedText(text);
}

export function numField(row: ImportRow, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v == null || v === "") continue;
    const n = Number(String(v).replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function strField(row: ImportRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}
