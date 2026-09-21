import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { str } from "@/lib/records";
import { getService } from "@/services/catalog";
import { useRecords } from "@/services/entityService";

const TRIGGERS = [
  "Stock below reorder level",
  "Invoice overdue",
  "Purchase order above threshold",
  "Leave request created",
  "QC failed",
  "Record approved",
];
const ACTIONS = [
  "Create alert + notify",
  "Notify + create task",
  "Start approval workflow",
  "Send WhatsApp",
  "Send email",
];

export function WorkflowRulesEditor() {
  const rules = useRecords("workflow_rules");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [action, setAction] = useState(ACTIONS[0]);
  const [recipient, setRecipient] = useState("Store Manager");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 && (
            <EmptyState
              title="No workflow rules"
              description="The approval matrix remains the source of truth for document approvals."
            />
          )}
          {rules.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.title}</p>
                <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>{r.status}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                When {str(r, "trigger")} → {str(r, "action")} · {str(r, "recipient")}
              </p>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Approvals still live on the{" "}
            <a href="/approvals/matrix" className="text-primary hover:underline">
              approval matrix
            </a>
            . This list is notification / automation only.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-trigger">Trigger</Label>
            <select
              id="wf-trigger"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            >
              {TRIGGERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-action">Action</Label>
            <select
              id="wf-action"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {ACTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-to">Recipient</Label>
            <Input id="wf-to" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <Button
            className="gap-2"
            onClick={async () => {
              if (!name.trim()) {
                toast.error("Name is required");
                return;
              }
              await getService("workflow_rules").create({
                title: name.trim(),
                status: "active",
                fields: { name: name.trim(), trigger, action, recipient, schedule: "Realtime" },
              });
              setName("");
              toast.success("Rule saved locally");
            }}
          >
            <Plus className="h-4 w-4" /> Save rule
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
