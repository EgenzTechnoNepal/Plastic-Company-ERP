import { toast } from "sonner";
import { API_V1 } from "@/services/api/endpoints";
import { apiFetch } from "@/services/api/client";
import { NotImplemented } from "./types";

export type GeminiStatus = {
  configured: boolean;
  provider?: string;
  model?: string | null;
  ready_for?: string[];
};

export async function getGeminiStatus(): Promise<GeminiStatus> {
  return apiFetch<GeminiStatus>(`${API_V1}/integrations/gemini/status/`, { silent: true });
}

/** Cloud OCR via Gemini (backend). Falls back to NotImplemented if API key missing. */
export async function runCloudOcr(image: Blob, filename = "scan.jpg"): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", image, filename);
  try {
    const res = await apiFetch<{ extracted: Record<string, unknown> }>(
      `${API_V1}/integrations/gemini/extract-gate-bill/`,
      { method: "POST", body: form, silent: true },
    );
    return res.extracted ?? {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OCR failed";
    if (msg.toLowerCase().includes("not set") || msg.toLowerCase().includes("not configured")) {
      toast.message("Add GOOGLE_GEMINI_API_KEY to Backend/.env to enable AI scan");
      throw new NotImplemented("OCR", "extract");
    }
    throw err;
  }
}
