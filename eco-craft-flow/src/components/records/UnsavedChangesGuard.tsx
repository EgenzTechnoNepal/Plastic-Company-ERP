import { useEffect } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

/**
 * Blocks in-app navigation and browser close while `dirty` is true.
 * TanStack Router's useBlocker varies by minor version — we keep a
 * beforeunload listener plus an explicit confirm when the parent asks.
 */
export function UnsavedChangesGuard({
  dirty,
  open,
  onOpenChange,
  onDiscard,
}: {
  dirty: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard unsaved changes?"
      description="Your edits have not been saved to the local store."
      confirmLabel="Discard"
      tone="destructive"
      onConfirm={onDiscard}
    />
  );
}
