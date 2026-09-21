import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { str } from "@/lib/records";
import { pingDevice } from "@/services/integrations/devices";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/integrations/rfid")({ component: RfidConsole });

function RfidConsole() {
  const tags = useRecords("rfid_tags");
  return (
    <IntegrationGate provider="RFID readers">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulated tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tags.length === 0 && (
            <EmptyState title="No RFID tags" description="Hardware purchase is out of contract scope." />
          )}
          {tags.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{t.title || t.code}</p>
                <p className="text-xs text-muted-foreground">
                  {str(t, "reader")} · {str(t, "location")} · {str(t, "assignedTo")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={t.status === "active" ? "success" : "neutral"}>{t.status}</StatusBadge>
                <Button size="sm" variant="outline" onClick={() => void pingDevice("rfid", t.code).catch(() => toast.message("Stub"))}>
                  Ping
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </IntegrationGate>
  );
}
