import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileUp, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { PermissionGuard } from "@/lib/permissions";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { convertOcrToBill, simulateOcrExtract } from "@/features/purchase/cycle";
import { irdFieldsToOcrPatch, parseIrdQrPayload } from "@/features/purchase/irdQr";
import { runCloudOcr } from "@/services/integrations/ocr";
import { getService } from "@/services/catalog";
import { logAudit, useRecords } from "@/services/entityService";
import { useNavigate } from "@tanstack/react-router";
import { recordPath } from "@/features/registry/paths";
import type { ErpRecord } from "@/types/erp";

function findDuplicate(rows: ErpRecord[], vendor: string, invoiceNo: string, amount: number, excludeId?: string) {
  return rows.find((r) => {
    if (excludeId && r.id === excludeId) return false;
    return (
      str(r, "invoiceNo") === invoiceNo &&
      Math.abs(num(r, "extractedTotal") - amount) < 0.01 &&
      (str(r, "vendor") === vendor || str(r, "pan") === vendor || !vendor)
    );
  });
}

export function OcrPanel({ scan }: { scan: ErpRecord }) {
  const navigate = useNavigate();
  const allScans = useRecords("ocr_bills");
  const confidence = num(scan, "confidence");
  const pct = Math.round(confidence * 100);
  const [qrText, setQrText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    typeof scan.fields.localImageDataUrl === "string" ? scan.fields.localImageDataUrl : null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<ErpRecord>, ok: string) => {
    try {
      const next = await fn();
      toast.success(ok);
      navigate({ to: recordPath(next.entity, next.code) as never });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OCR action failed");
    }
  };

  const applyQr = async (raw: string) => {
    const parsed = parseIrdQrPayload(raw);
    if (!parsed.invoiceNo && !parsed.vendorPan && !parsed.amount) {
      toast.error("Could not parse QR payload");
      return;
    }
    const vendorKey = parsed.vendorName || parsed.vendorPan;
    const dup = findDuplicate(allScans, vendorKey, parsed.invoiceNo, parsed.amount, scan.id);
    if (dup) {
      toast.error(`Possible duplicate of ${dup.code} (same vendor + invoice + amount)`);
      logAudit({
        action: "edit",
        module: "purchase",
        entity: "ocr_bills",
        recordId: scan.id,
        recordCode: scan.code,
        after: { duplicateOf: dup.code },
        reason: "duplicate_check",
      });
    }
    const patch = irdFieldsToOcrPatch(parsed);
    const updated = await getService("ocr_bills").update(scan.id, {
      status: "in_progress",
      date: parsed.date || scan.date,
      title: parsed.vendorName || scan.title || `QR ${parsed.invoiceNo}`,
      fields: { ...scan.fields, ...patch },
    });
    logAudit({
      action: "edit",
      module: "purchase",
      entity: "ocr_bills",
      recordId: scan.id,
      recordCode: scan.code,
      after: { source: "QR Scan", invoiceNo: parsed.invoiceNo },
    });
    toast.success(dup ? "QR applied — review duplicate carefully" : "QR fields applied locally");
    navigate({ to: recordPath(updated.entity, updated.code) as never });
  };

  const onImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? "");
      setPreviewUrl(dataUrl);
      await getService("ocr_bills").update(scan.id, {
        fields: {
          ...scan.fields,
          source: "Image Upload",
          localImageDataUrl: dataUrl.slice(0, 200_000),
          localImageName: file.name,
        },
      });
      logAudit({
        action: "edit",
        module: "purchase",
        entity: "ocr_bills",
        recordId: scan.id,
        recordCode: scan.code,
        after: { source: "Image Upload", localOnly: true },
      });
      toast.message("Image kept in-memory / local record — not uploaded to third parties");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <IntegrationGate provider="Cloud OCR engine">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bill capture — QR & local image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Scan an IRD tax-invoice QR or paste its payload to fill vendor, PAN, invoice no., date, amount and VAT.
              Cloud OCR stays disabled until Django. Images never leave this browser session to third parties.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={pct >= 90 ? "success" : pct >= 70 ? "warning" : "neutral"}>
                {pct ? `${pct}% confidence` : "Not extracted"}
              </StatusBadge>
              <StatusBadge
                tone={
                  str(scan, "matchStatus") === "Matched"
                    ? "success"
                    : str(scan, "matchStatus") === "Exception"
                      ? "danger"
                      : "neutral"
                }
              >
                {str(scan, "matchStatus") || "Pending"}
              </StatusBadge>
            </div>
            <p>
              {str(scan, "vendor") || "Vendor pending"} · PAN {str(scan, "pan") || "—"} ·{" "}
              {str(scan, "invoiceNo") || "No invoice no."} · {npr(num(scan, "extractedTotal"))}
              {num(scan, "vat") ? ` · VAT ${npr(num(scan, "vat"))}` : ""}
            </p>
            {previewUrl && (
              <img src={previewUrl} alt="Local bill attachment" className="max-h-40 rounded-md border object-contain" />
            )}
            {scan.status !== "completed" && (
              <PermissionGuard action="edit" module="purchase">
                <div className="space-y-3 rounded-lg border p-3">
                  <Label htmlFor="qr-payload">QR payload (paste or type)</Label>
                  <Input
                    id="qr-payload"
                    value={qrText}
                    onChange={(e) => setQrText(e.target.value)}
                    placeholder='{"seller_pan":"601990001","invoice_number":"..."} or pan|buyer|fy|inv|date|amt|vat'
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => void applyQr(qrText)}>
                      <QrCode className="h-4 w-4" /> Apply QR fields
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => fileRef.current?.click()}
                    >
                      <FileUp className="h-4 w-4" /> Upload image
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onImage(f);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled
                      title="OCR engine — backend"
                      onClick={() => void runCloudOcr(new Blob()).catch(() => undefined)}
                    >
                      <Camera className="h-4 w-4" /> OCR engine — backend
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => simulateOcrExtract(scan), "Extracted (simulated)")}>
                      Simulate extract
                    </Button>
                    <Button size="sm" onClick={() => run(() => convertOcrToBill(scan), "Vendor bill created")}>
                      Convert to bill
                    </Button>
                  </div>
                </div>
              </PermissionGuard>
            )}
          </CardContent>
        </Card>
      </IntegrationGate>
    </div>
  );
}
