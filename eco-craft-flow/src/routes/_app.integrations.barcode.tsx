import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pingDevice } from "@/services/integrations/devices";

const DEVICES = [
  { id: "SCN-01", name: "Goods-in handheld", location: "Receiving" },
  { id: "SCN-02", name: "FG dispatch scanner", location: "Dispatch" },
  { id: "SCN-03", name: "Store bin reader", location: "RM store" },
];

export const Route = createFileRoute("/_app/integrations/barcode")({ component: BarcodeConsole });

function BarcodeConsole() {
  return (
    <IntegrationGate provider="Barcode scanners">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulated devices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Hardware purchase is out of proposal scope. This list is the placeholder Django will pair later.
          </p>
          {DEVICES.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.id} · {d.location}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void pingDevice("barcode", d.id).catch(() => toast.message("Stub"))}>
                Test scan
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </IntegrationGate>
  );
}
