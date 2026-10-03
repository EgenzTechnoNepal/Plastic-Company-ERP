import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/services/api/client";
import { API_V1 } from "@/services/api/endpoints";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ErpRecord } from "@/types/erp";
import {
  lcAiScanDraft,
  lcAiSuggestPreDispatch,
  lcIssueFinal,
  lcRunMatch,
  lcScanDraft,
  lcSellerOk,
  lcVerifyPreDispatch,
  type LetterOfCreditDto,
} from "@/services/api/phase3";

const REQUIRED_KEYS = ["commercial_invoice", "packing_list", "bill_of_lading", "coa"] as const;

function mapDto(dto: LetterOfCreditDto, prev: ErpRecord): ErpRecord {
  const match = dto.match_result ?? {};
  const issues = Array.isArray(match.issues) ? match.issues : [];
  const extracted = (dto as LetterOfCreditDto & { draft_extracted?: Record<string, unknown> }).draft_extracted ?? {};
  return {
    ...prev,
    status: (dto.status as ErpRecord["status"]) ?? prev.status,
    fields: {
      ...prev.fields,
      draftAmount: extracted.amount ?? prev.fields.draftAmount,
      draftCurrency: extracted.currency ?? prev.fields.draftCurrency,
      draftBeneficiary: extracted.beneficiary ?? prev.fields.draftBeneficiary,
      matchSummary:
        match.passed === true
          ? "Match passed (PO + PI)."
          : match.passed === false
            ? `Match failed: ${issues.map((i: { message?: string }) => i.message).filter(Boolean).join(" ")}`
            : prev.fields.matchSummary,
      preDispatchMessage: dto.pre_dispatch_message ?? prev.fields.preDispatchMessage,
      gateAllowed: dto.gate_allowed,
      gateMessage: dto.gate_message,
    },
  };
}

function useGeminiConfigured(): boolean {
  const { data } = useQuery({
    queryKey: ["gemini-status"],
    queryFn: () => apiFetch<{ configured: boolean }>(`${API_V1}/integrations/gemini/status/`, { silent: true }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return Boolean(data?.configured);
}

/** LC workflow: optional Gemini-assisted extract → human review → rules-based match → seller OK → Final → pre-dispatch. */
export function LcWorkflowPanel({
  record,
  onUpdated,
}: {
  record: ErpRecord;
  onUpdated?: (next: ErpRecord) => void;
}) {
  const id = String(record.fields?.typedId ?? record.id);
  const geminiConfigured = useGeminiConfigured();
  const [busy, setBusy] = useState(false);
  const [draftAmount, setDraftAmount] = useState(String(record.fields?.draftAmount ?? record.fields?.amount ?? ""));
  const [draftCurrency, setDraftCurrency] = useState(String(record.fields?.draftCurrency ?? record.fields?.currencyCode ?? "USD"));
  const [draftBeneficiary, setDraftBeneficiary] = useState(String(record.fields?.draftBeneficiary ?? ""));
  const [finalNumber, setFinalNumber] = useState(String(record.fields?.lcNumber ?? ""));
  const [present, setPresent] = useState<Record<string, boolean>>({
    commercial_invoice: true,
    packing_list: true,
    bill_of_lading: true,
    coa: true,
  });
  const draftFileRef = useRef<HTMLInputElement>(null);
  const packetFileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<LetterOfCreditDto>, okMsg: string) => {
    setBusy(true);
    try {
      const dto = await fn();
      const next = mapDto(dto, record);
      const ex = (dto as LetterOfCreditDto & { draft_extracted?: Record<string, unknown> }).draft_extracted;
      if (ex?.amount != null) setDraftAmount(String(ex.amount));
      if (ex?.currency != null) setDraftCurrency(String(ex.currency));
      if (ex?.beneficiary != null) setDraftBeneficiary(String(ex.beneficiary));
      toast.success(okMsg);
      onUpdated?.(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onAiDraftFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dto = await lcAiScanDraft(id, file);
      const ex = dto.draft_extracted ?? {};
      if (ex.amount != null) setDraftAmount(String(ex.amount));
      if (ex.currency != null) setDraftCurrency(String(ex.currency));
      if (ex.beneficiary != null) setDraftBeneficiary(String(ex.beneficiary));
      toast.success("Gemini filled Draft LC fields — review then Run match");
      onUpdated?.(mapDto(dto, record));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI scan failed");
    } finally {
      setBusy(false);
      if (draftFileRef.current) draftFileRef.current.value = "";
    }
  };

  const onAiPacketFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const suggestion = await lcAiSuggestPreDispatch(id, Array.from(list));
      const keys = suggestion.present_keys ?? [];
      setPresent((s) => {
        const next = { ...s };
        for (const k of REQUIRED_KEYS) next[k] = keys.includes(k);
        return next;
      });
      toast.success(suggestion.summary || "Gemini suggested checklist — review then Verify");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI suggest failed");
    } finally {
      setBusy(false);
      if (packetFileRef.current) packetFileRef.current.value = "";
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">LC workflow</CardTitle>
        <p className="text-xs text-muted-foreground">
          {geminiConfigured ? "Upload → Gemini suggests draft fields → you review" : "Enter draft LC fields"} → rules-based
          PO/PI match → seller OK → Final LC → pre-dispatch checklist (भन्सार shield)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {record.fields?.preDispatchMessage ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{String(record.fields.preDispatchMessage)}</p>
        ) : null}
        {record.fields?.matchSummary ? (
          <p className="text-sm text-muted-foreground">{String(record.fields.matchSummary)}</p>
        ) : null}

        {geminiConfigured && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={draftFileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onAiDraftFile(e.target.files?.[0])}
            />
            <Button size="sm" type="button" disabled={busy} onClick={() => draftFileRef.current?.click()}>
              Scan draft LC with Gemini (assistive)
            </Button>
            <span className="text-xs text-muted-foreground">or fill fields manually</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Draft LC amount</Label>
            <Input value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-1">
            <Label>Draft currency</Label>
            <Input value={draftCurrency} onChange={(e) => setDraftCurrency(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-1">
            <Label>Beneficiary</Label>
            <Input value={draftBeneficiary} onChange={(e) => setDraftBeneficiary(e.target.value)} disabled={busy} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  lcScanDraft(id, {
                    extracted: {
                      amount: draftAmount,
                      currency: draftCurrency,
                      beneficiary: draftBeneficiary,
                    },
                  }),
                "Draft LC scanned",
              )
            }
          >
            1. Save Draft extract
          </Button>
          <Button size="sm" type="button" variant="secondary" disabled={busy} onClick={() => run(() => lcRunMatch(id), "Rules-based match finished")}>
            2. Run match (PO + PI)
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => lcSellerOk(id, "Yes, it is okay, you can proceed."), "Seller approved draft")}
          >
            3. Seller OK
          </Button>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-40"
              placeholder="Final LC no."
              value={finalNumber}
              onChange={(e) => setFinalNumber(e.target.value)}
              disabled={busy}
            />
            <Button
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => run(() => lcIssueFinal(id, finalNumber), "Final LC issued")}
            >
              4. Issue Final LC
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/50 pt-3">
          <p className="text-sm font-medium">Pre-dispatch document packet</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={packetFileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => onAiPacketFiles(e.target.files)}
            />
            {geminiConfigured && (
              <Button size="sm" type="button" variant="outline" disabled={busy} onClick={() => packetFileRef.current?.click()}>
                Suggest checklist with Gemini (assistive)
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {REQUIRED_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(present[key])}
                  disabled={busy}
                  onChange={(e) => setPresent((s) => ({ ...s, [key]: e.target.checked }))}
                />
                {key.replaceAll("_", " ")}
              </label>
            ))}
          </div>
          <Button
            size="sm"
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => lcVerifyPreDispatch(id, REQUIRED_KEYS.filter((k) => present[k])),
                "Pre-dispatch verified",
              )
            }
          >
            5. Verify pre-dispatch (approve)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
