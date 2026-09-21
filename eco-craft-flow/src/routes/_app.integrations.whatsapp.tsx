import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { str } from "@/lib/records";
import { sendWhatsApp, useWhatsAppDeliveryLog } from "@/services/integrations/whatsapp";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/integrations/whatsapp")({ component: WhatsAppConsole });

function WhatsAppConsole() {
  const templates = useRecords("whatsapp_templates");
  const log = useWhatsAppDeliveryLog();
  const [code, setCode] = useState(templates[0]?.code ?? "");
  const [to, setTo] = useState("+9779800000000");
  const selected = useMemo(
    () => templates.find((t) => t.code === code) ?? templates[0],
    [templates, code],
  );
  const body = selected ? str(selected, "body") || "Hello {{name}}, your document {{code}} is ready." : "";

  return (
    <IntegrationGate provider="WhatsApp Business (Meta)">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length === 0 ? (
              <EmptyState title="No templates" description="Seeded WhatsApp templates appear here." />
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCode(t.code)}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.code} · {str(t, "category")}</p>
                  </div>
                  <StatusBadge tone={t.status === "active" ? "success" : "neutral"}>{t.status}</StatusBadge>
                </button>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="wa-to">To</Label>
              <Input id="wa-to" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{body}</div>
            <Button
              className="gap-2"
              onClick={async () => {
                if (!selected) {
                  toast.error("Pick a template first");
                  return;
                }
                await sendWhatsApp({ templateCode: selected.code, to, body });
              }}
            >
              <Send className="h-4 w-4" /> Simulated send
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Delivery log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {log.length === 0 && (
            <p className="text-muted-foreground">No simulated deliveries yet.</p>
          )}
          {log.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{row.to}</p>
                <p className="text-xs text-muted-foreground">{row.templateCode} · {new Date(row.at).toLocaleString()}</p>
              </div>
              <StatusBadge tone="info">{row.status}</StatusBadge>
            </div>
          ))}
        </CardContent>
      </Card>
    </IntegrationGate>
  );
}
