import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NotImplemented, integrationStatus } from "./types";

export interface WhatsAppSendInput {
  templateCode: string;
  to: string;
  body: string;
  variables?: Record<string, string>;
}

export interface WhatsAppDelivery {
  id: string;
  at: string;
  to: string;
  templateCode: string;
  body: string;
  status: "queued" | "simulated" | "failed";
  note: string;
}

interface DeliveryState {
  log: WhatsAppDelivery[];
  push: (row: WhatsAppDelivery) => void;
}

const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set) => ({
      log: [],
      push: (row) => set((s) => ({ log: [row, ...s.log].slice(0, 200) })),
    }),
    { name: "ecowrap-wa-delivery" },
  ),
);

export function useWhatsAppDeliveryLog(): WhatsAppDelivery[] {
  return useDeliveryStore((s) => s.log);
}

/** Simulated send — never calls Meta. */
export async function sendWhatsApp(input: WhatsAppSendInput): Promise<WhatsAppDelivery> {
  if (integrationStatus("whatsapp") !== "ready") {
    const row: WhatsAppDelivery = {
      id: `wa-${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      to: input.to,
      templateCode: input.templateCode,
      body: input.body,
      status: "simulated",
      note: "Queued locally. Meta Cloud API is not called from the browser.",
    };
    useDeliveryStore.getState().push(row);
    toast.message("WhatsApp send simulated — provider not connected");
    return row;
  }
  throw new NotImplemented("WhatsApp", "send");
}
