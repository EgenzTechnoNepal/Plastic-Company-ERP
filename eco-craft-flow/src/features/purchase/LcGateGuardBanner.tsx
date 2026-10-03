import { AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import type { ErpRecord } from "@/types/erp";

/** Warn when Gate/GRN is blocked until LC pre-dispatch is cleared. */
export function LcGateGuardBanner({ record }: { record: ErpRecord }) {
  const allowed = record.fields?.lcGateAllowed;
  if (allowed !== false) return null;

  const message =
    String(record.fields?.lcGateMessage ?? "").trim() ||
    "Pre-dispatch documents not cleared as per LC. Gate/GRN is blocked.";
  const lcDoc = String(record.fields?.lcDocumentNumber ?? "").trim();
  const lcPath = lcDoc
    ? `/purchase/letters-of-credit/${encodeURIComponent(lcDoc)}`
    : "/purchase/letters-of-credit";

  return (
    <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
      <CardContent className="flex gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-destructive">LC gate blocked</p>
          <p className="text-muted-foreground">{message}</p>
          <Link to={lcPath} className="inline-block text-sm font-medium text-primary hover:underline">
            {lcDoc ? `Open ${lcDoc}` : "Open Letters of Credit"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
