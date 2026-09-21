export type CsvRow = Record<string, string | number>;

export function toCsv(rows: CsvRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: CsvRow[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** SpreadsheetML that Excel and LibreOffice open as a workbook. */
export function downloadXls(filename: string, rows: CsvRow[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: string | number) => `<td>${String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${headers.map((h) => cell(r[h])).join("")}</tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printPdf() {
  window.print();
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Simple Word-compatible HTML blob (proposal F3/F4). Invoice layout is out of scope. */
export function downloadDoc(filename: string, title: string, bodyHtml: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1>${title}</h1>${bodyHtml}</body></html>`;
  downloadBlob(
    filename.endsWith(".doc") ? filename : `${filename}.doc`,
    new Blob(["\uFEFF", html], { type: "application/msword" }),
  );
}

/** Opens a print window so the user can save as PDF (no cloud renderer). */
export function downloadPdfHtml(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    printPdf();
    return;
  }
  w.document.write(
    `<!doctype html><html><head><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;text-align:left}</style></head><body><h1>${title}</h1>${bodyHtml}</body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

export function rowsToHtmlTable(rows: CsvRow[]): string {
  if (!rows.length) return "<p>No rows</p>";
  const headers = Object.keys(rows[0]);
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${String(r[h] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export const nf = new Intl.NumberFormat("en-IN");
export const npr = (n: number) => `NPR ${nf.format(Math.round(n))}`;
/** Alias used by older screens — same formatter. */
export const formatNPR = npr;

export function compactNpr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `Rs ${(n / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `Rs ${(n / 100_000).toFixed(2)}L`;
  return npr(n);
}
