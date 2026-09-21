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

export const Route = createFileRoute("/_app/integrations/iot")({ component: IotConsole });

function IotConsole() {
  const sensors = useRecords("iot_sensors");
  return (
    <IntegrationGate provider="IoT sensors">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulated sensors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sensors.length === 0 && (
            <EmptyState title="No sensors" description="Shop-floor telemetry waits for the backend adapter." />
          )}
          {sensors.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{s.title || s.code}</p>
                <p className="text-xs text-muted-foreground">
                  {str(s, "machine")} · {str(s, "metric")} · {str(s, "value")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={str(s, "health") === "OK" || s.status === "active" ? "success" : "warning"}>
                  {str(s, "health") || s.status}
                </StatusBadge>
                <Button size="sm" variant="outline" onClick={() => void pingDevice("iot", s.code).catch(() => toast.message("Stub"))}>
                  Read
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </IntegrationGate>
  );
}
