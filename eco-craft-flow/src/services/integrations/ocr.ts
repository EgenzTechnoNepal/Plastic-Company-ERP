import { toast } from "sonner";
import { NotImplemented } from "./types";

/** Cloud OCR engine — disabled until Django + vendor credentials exist. */
export async function runCloudOcr(_image: Blob): Promise<never> {
  toast.message("OCR engine — backend phase");
  throw new NotImplemented("OCR", "extract");
}
