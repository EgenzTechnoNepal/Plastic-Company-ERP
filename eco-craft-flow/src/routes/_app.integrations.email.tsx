import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { IntegrationGate } from "@/components/integrations/IntegrationGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { sendReportEmail, useOutboundMail, RESEND_SETTINGS_SHAPE } from "@/services/integrations/resend";

export const Route = createFileRoute("/_app/integrations/email")({ component: EmailConsole });

function EmailConsole() {
  const queue = useOutboundMail();
  const [to, setTo] = useState("accounts@ecowrap.com");
  const [subject, setSubject] = useState("EcoWrap weekly pack");
  const [from, setFrom] = useState<string>(RESEND_SETTINGS_SHAPE.from);

  return (
    <IntegrationGate provider="Resend email">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resend-shaped settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reply">Reply-to</Label>
              <Input id="reply" defaultValue={RESEND_SETTINGS_SHAPE.replyTo} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key">API key</Label>
              <Input id="key" type="password" value="" placeholder="Set on Django — never in VITE_*" readOnly />
            </div>
            <p className="text-xs text-muted-foreground">
              Browser client queues only. Django later posts to <code>POST /api/v1/integrations/email/send/</code>.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compose (queue)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <Button
              onClick={() =>
                void sendReportEmail({
                  from,
                  to: to.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                  subject,
                  html: `<p>${subject}</p><p>Queued from EcoWrap frontend. No Resend call from the browser.</p>`,
                  schedule: "once",
                })
              }
            >
              Queue send
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Outbound queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {queue.length === 0 && (
            <EmptyState title="Queue is empty" description="Sends from Reports → Builder also land here." />
          )}
          {queue.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{row.subject}</p>
                <p className="text-xs text-muted-foreground">{row.to.join(", ")} · {row.from}</p>
              </div>
              <StatusBadge tone={row.status === "scheduled" ? "warning" : "info"}>{row.status}</StatusBadge>
            </div>
          ))}
        </CardContent>
      </Card>
    </IntegrationGate>
  );
}
