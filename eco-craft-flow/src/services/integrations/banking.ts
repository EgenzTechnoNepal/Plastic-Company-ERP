import { toast } from "sonner";
import { NotImplemented } from "./types";

export async function importBankStatement(_file: File): Promise<never> {
  toast.message("Bank import — provider not connected");
  throw new NotImplemented("Banking", "import");
}

export async function importEsewa(_file: File): Promise<never> {
  toast.message("eSewa import — provider not connected");
  throw new NotImplemented("eSewa", "import");
}
