import type { ReactNode } from "react";
import type { IntegrationStatus } from "@/services/integrations/types";

export function IntegrationGate({
  provider,
  status = "stub",
  children,
}: {
  provider: string;
  status?: IntegrationStatus;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {status !== "ready" && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <p className="font-medium">{provider} not connected — backend phase</p>
          <p className="mt-0.5 text-muted-foreground">
            This console uses local records only. Live {provider} credentials stay on Django, never in the
            Vite app.
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
