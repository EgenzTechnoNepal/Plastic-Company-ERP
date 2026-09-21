import { createFileRoute, Link } from "@tanstack/react-router";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importBankStatement, importEsewa } from "@/services/integrations/banking";

export const Route = createFileRoute("/_app/integrations/banking")({ component: BankingConsole });

function BankingConsole() {
  return (
    <IntegrationGate provider="Banking / eSewa">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statement import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Upload a bank CSV or eSewa export. Parsing stays on Django; this screen is the shell.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv,.txt,.xlsx";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) void importBankStatement(file).catch(() => undefined);
                  };
                  input.click();
                }}
              >
                Bank file
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) void importEsewa(file).catch(() => undefined);
                  };
                  input.click();
                }}
              >
                eSewa export
              </Button>
              <Button size="sm" asChild>
                <Link to="/accounting/reconciliation">Open bank rec</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Nabil Bank", "CSV / MT940"],
              ["NIC Asia", "CSV"],
              ["eSewa", "Settlement file"],
            ].map(([name, kind]) => (
              <div key={name} className="flex justify-between rounded-lg border p-3">
                <span>{name}</span>
                <span className="text-muted-foreground">{kind}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </IntegrationGate>
  );
}
