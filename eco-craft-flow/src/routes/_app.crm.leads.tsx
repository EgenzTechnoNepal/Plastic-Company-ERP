import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Phone, TrendingUp, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LEAD_STAGES } from "@/constants/masters";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { getService } from "@/services/catalog";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/crm/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  const leads = useRecords("leads");
  const byStage = (stage: string) => leads.filter((l) => str(l, "stage") === stage);
  const pipelineValue = leads
    .filter((l) => str(l, "stage") !== "lost")
    .reduce((s, l) => s + num(l, "expectedValue"), 0);
  const wonValue = byStage("won").reduce((s, l) => s + num(l, "expectedValue"), 0);
  const open = leads.filter((l) => {
    const stage = str(l, "stage");
    return stage !== "won" && stage !== "lost";
  }).length;

  const moveLead = async (leadId: string, stage: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || str(lead, "stage") === stage) return;
    const history = Array.isArray(lead.fields.stageHistory) ? lead.fields.stageHistory : [];
    await getService("leads").update(lead.id, {
      fields: {
        ...lead.fields,
        stage,
        stageHistory: [...history, { from: str(lead, "stage"), to: stage, at: new Date().toISOString() }],
      },
    });
    toast.success(`Moved to ${LEAD_STAGES.find((s) => s.id === stage)?.label ?? stage}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Open Leads</div>
            <div className="mt-1 text-2xl font-bold">{open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pipeline Value</div>
            <div className="mt-1 text-xl font-bold">{npr(pipelineValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Won This Month</div>
            <div className="mt-1 text-xl font-bold text-primary">{npr(wonValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Conversion</div>
            <div className="mt-1 text-2xl font-bold">
              {leads.length ? Math.round((byStage("won").length / leads.length) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">Drag a card onto another stage to update the pipeline.</p>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 pb-2" style={{ minWidth: "min-content" }}>
          {LEAD_STAGES.map((stage) => {
            const items = byStage(stage.id);
            const total = items.reduce((s, l) => s + num(l, "expectedValue"), 0);
            return (
              <div
                key={stage.id}
                className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/lead-id");
                  if (id) void moveLead(id, stage.id);
                }}
              >
                <div className="flex items-center justify-between rounded-t-lg border-b bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">{npr(total)}</div>
                </div>
                <div className="flex min-h-[8rem] flex-col gap-2 p-2">
                  {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Drop leads here</div>}
                  {items.map((l) => (
                    <Link
                      key={l.id}
                      to={recordPath("leads", l.code) as never}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/lead-id", l.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">{l.code}</div>
                      <div className="mt-1 truncate text-sm font-semibold">{l.title}</div>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">{str(l, "owner")}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {str(l, "phone")}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t pt-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {str(l, "source")}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                          <TrendingUp className="h-3 w-3" />
                          {npr(num(l, "expectedValue"))}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
