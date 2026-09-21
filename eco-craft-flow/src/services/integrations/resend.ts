import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NotImplemented, integrationStatus } from "./types";

export type MailSchedule = "once" | "weekly";
export type MailStatus = "queued" | "scheduled" | "failed";

export interface ResendSendInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; contentType: string; bytes?: number }>;
  schedule?: MailSchedule;
}

export interface OutboundMail extends ResendSendInput {
  id: string;
  status: MailStatus;
  createdAt: string;
  provider: "resend";
  note: string;
}

interface MailState {
  queue: OutboundMail[];
  enqueue: (row: OutboundMail) => void;
}

const useMailStore = create<MailState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (row) => set((s) => ({ queue: [row, ...s.queue].slice(0, 200) })),
    }),
    { name: "ecowrap-outbound-mail" },
  ),
);

export function useOutboundMail(): OutboundMail[] {
  return useMailStore((s) => s.queue);
}

/**
 * Resend-shaped client. Queues locally and never `fetch`es api.resend.com
 * (API keys must not live in the Vite app). Django later: POST /api/v1/integrations/email/send/
 */
export async function sendReportEmail(input: ResendSendInput): Promise<OutboundMail> {
  if (integrationStatus("resend") === "ready") {
    throw new NotImplemented("Resend", "send");
  }
  const row: OutboundMail = {
    ...input,
    id: `mail-${Date.now().toString(36)}`,
    status: input.schedule === "weekly" ? "scheduled" : "queued",
    createdAt: new Date().toISOString(),
    provider: "resend",
    note: "Held in the browser queue. Django will send with RESEND_API_KEY.",
  };
  useMailStore.getState().enqueue(row);
  try {
    const { getService } = await import("@/services/catalog");
    await getService("outbound_mail").create({
      title: input.subject,
      status: row.status === "scheduled" ? "in_progress" : "draft",
      fields: {
        from: input.from,
        to: input.to.join(", "),
        cc: (input.cc ?? []).join(", "),
        subject: input.subject,
        schedule: input.schedule ?? "once",
        provider: "resend",
        note: row.note,
      },
    });
  } catch {
    /* entity may be mock-only / missing live path */
  }
  toast.success(row.status === "scheduled" ? "Weekly report queued locally" : "Email queued locally");
  return row;
}

export const RESEND_SETTINGS_SHAPE = {
  from: "reports@ecowrap.com",
  replyTo: "accounts@ecowrap.com",
  apiKeyMasked: "",
} as const;
