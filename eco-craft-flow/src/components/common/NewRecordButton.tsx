import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RecordFormDialog } from "./RecordFormDialog";
import { getFormDefinition } from "@/features/forms/definitions";
import { createFromForm } from "@/services/catalog";

interface NewRecordButtonProps {
  formKey: string;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  className?: string;
}

export function NewRecordButton({
  formKey,
  label,
  size = "sm",
  variant = "default",
  className,
}: NewRecordButtonProps) {
  const [open, setOpen] = useState(false);
  const definition = getFormDefinition(formKey);

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {label ?? definition.title.replace(/^New /, "New ")}
      </Button>
      <RecordFormDialog
        definition={definition}
        open={open}
        onOpenChange={setOpen}
        onSubmit={async (values) => {
          try {
            const record = await createFromForm(formKey, values);
            toast.success(`${definition.title.replace(/^New /, "")} saved`, {
              description: `${record.code} stored locally — will POST to ${definition.endpoint} when Django is connected.`,
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save record");
          }
        }}
      />
    </>
  );
}