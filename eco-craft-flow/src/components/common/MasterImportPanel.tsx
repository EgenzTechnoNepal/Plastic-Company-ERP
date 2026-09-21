import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadDoc, downloadPdfHtml, downloadXls, rowsToHtmlTable, type CsvRow } from "@/lib/export";
import { parseSpreadsheetFile, type ImportRow } from "@/lib/import";

interface MasterImportPanelProps {
  title: string;
  description: string;
  templateHeaders: readonly string[];
  templateFilename: string;
  onImport: (rows: ImportRow[]) => Promise<{ message: string }>;
  sampleRows?: CsvRow[];
}

export function MasterImportPanel({
  title,
  description,
  templateHeaders,
  templateFilename,
  onImport,
  sampleRows = [],
}: MasterImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);

  const templateRows: CsvRow[] =
    sampleRows.length > 0
      ? sampleRows
      : [Object.fromEntries(templateHeaders.map((h) => [h, ""]))];

  const runImport = async () => {
    if (!preview.length) {
      toast.error("Upload a file first");
      return;
    }
    setBusy(true);
    try {
      const { message } = await onImport(preview);
      toast.success(message);
      setPreview([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => downloadXls(templateFilename, templateRows)}>
            <Download className="h-3.5 w-3.5" />
            Excel template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => downloadPdfHtml(`${title} template`, rowsToHtmlTable(templateRows))}
          >
            <FileText className="h-3.5 w-3.5" />
            PDF template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => downloadDoc(templateFilename.replace(".xls", ""), title, rowsToHtmlTable(templateRows))}
          >
            <FileText className="h-3.5 w-3.5" />
            Word template
          </Button>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import CSV / Excel
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xls,.xlsx,.html"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const rows = await parseSpreadsheetFile(file);
                setPreview(rows);
                toast.success(`${rows.length} rows loaded — review and click Apply import`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not read file");
              }
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Supports <strong>.csv</strong>, <strong>.xls</strong> (Excel HTML), tab-separated text. PDF/Word templates are for filling offline; re-import via Excel/CSV.
        </p>
        {preview.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                <FileSpreadsheet className="mr-1 inline h-4 w-4" />
                Preview ({preview.length} rows)
              </span>
              <Button size="sm" disabled={busy} onClick={() => void runImport()}>
                Apply import
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(preview[0]).map((k) => (
                      <TableHead key={k} className="text-xs">
                        {k}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      {Object.keys(preview[0]).map((k) => (
                        <TableCell key={k} className="text-xs">
                          {row[k]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
