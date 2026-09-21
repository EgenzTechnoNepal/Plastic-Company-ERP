import { toast } from "sonner";
import { NotImplemented } from "./types";

export async function pingDevice(kind: "rfid" | "iot" | "barcode", id: string): Promise<never> {
  toast.message(`${kind.toUpperCase()} ${id} — hardware not connected`);
  throw new NotImplemented(kind, "ping");
}
