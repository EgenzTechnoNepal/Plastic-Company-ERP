import { toast } from "sonner";
import { NotImplemented, integrationStatus } from "./types";

export interface IrdSubmitInput {
  invoiceCode: string;
  buyerPan: string;
  amount: number;
}

export async function submitToCbms(_input: IrdSubmitInput): Promise<never> {
  toast.message("IRD CBMS — provider not connected");
  throw new NotImplemented("IRD/CBMS", "submit");
}

export async function retryCbms(_submissionId: string): Promise<{ queued: boolean }> {
  if (integrationStatus("ird") !== "ready") {
    toast.message("Queued locally — CBMS retry runs in the backend phase");
    return { queued: true };
  }
  throw new NotImplemented("IRD/CBMS", "retry");
}

export function checkPanFormat(pan: string): { ok: boolean; message: string } {
  const digits = pan.replace(/\D/g, "");
  if (digits.length === 9) return { ok: true, message: "PAN format looks valid (local check only)" };
  return { ok: false, message: "Nepal PAN is 9 digits. No IRD lookup until CBMS is connected." };
}
