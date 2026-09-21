import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { npr } from "@/lib/export";
import { ENTITIES } from "@/features/registry/entities";
import { ROLES, ROLE_LABELS, type Role } from "@/constants/roles";
import { removeApprovalRule, saveApprovalRule, useApprovalRules } from "@/services/entityService";
import type { ApprovalRule } from "@/types/erp";
import { PermissionGuard } from "@/lib/permissions";

export const Route = createFileRoute("/_app/approvals/matrix")({
  component: ApprovalMatrixPage,
});

const DOC_TYPES = Array.from(
  new Set(ENTITIES.map((e) => e.documentType).filter((x): x is string => Boolean(x))),
).sort();
const DEPARTMENTS = Array.from(new Set(ENTITIES.map((e) => e.department).filter((x): x is string => Boolean(x)))).sort();

function emptyRule(): ApprovalRule {
  return {
    id: `AR-${Date.now().toString(36).toUpperCase()}`,
    documentType: DOC_TYPES[0] ?? "Quotation",
    department: DEPARTMENTS[0] ?? "Sales",
    minAmount: 0,
    maxAmount: null,
    approverRole: "manager",
    level: 1,
    mode: "sequential",
    escalationHours: 24,
    autoApproveBelow: 0,
    active: true,
  };
}

function ApprovalMatrixPage() {
  const rules = useApprovalRules();
  const [editing, setEditing] = useState<ApprovalRule | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState("all");

  const visible = useMemo(
    () => (docFilter === "all" ? rules : rules.filter((r) => r.documentType === docFilter)),
    [rules, docFilter],
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Document type × department × value band × role × level. Sequential waits for each level; parallel needs every role at that level.
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={docFilter} onValueChange={setDocFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PermissionGuard action="edit" module="approvals">
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(emptyRule())}>
              <Plus className="h-4 w-4" /> Add band
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Value band</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Escalate</TableHead>
                  <TableHead>Auto-approve</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing({ ...r })}>
                    <TableCell className="font-medium">{r.documentType}</TableCell>
                    <TableCell>{r.department}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {npr(r.minAmount)} – {r.maxAmount == null ? "∞" : npr(r.maxAmount)}
                    </TableCell>
                    <TableCell>{ROLE_LABELS[r.approverRole as Role] ?? r.approverRole}</TableCell>
                    <TableCell>L{r.level}</TableCell>
                    <TableCell>
                      <StatusBadge tone={r.mode === "parallel" ? "info" : "neutral"}>{r.mode}</StatusBadge>
                    </TableCell>
                    <TableCell>{r.escalationHours}h</TableCell>
                    <TableCell>{r.autoApproveBelow ? npr(r.autoApproveBelow) : "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={r.active}
                        onCheckedChange={(on) => {
                          saveApprovalRule({ ...r, active: on });
                          toast.success(`${r.id} ${on ? "enabled" : "disabled"}`);
                        }}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setRemoveId(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {visible.map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full rounded-lg border p-3 text-left"
                onClick={() => setEditing({ ...r })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.documentType}</span>
                  <StatusBadge tone={r.active ? "success" : "neutral"}>{r.active ? "active" : "off"}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.department} · L{r.level} {r.mode} · {ROLE_LABELS[r.approverRole as Role] ?? r.approverRole}
                </p>
                <p className="font-mono text-xs">{npr(r.minAmount)} – {r.maxAmount == null ? "∞" : npr(r.maxAmount)}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <RuleDialog rule={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="Remove this band?"
        description="Pending documents keep their current approval row; new submits use the remaining matrix."
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={() => {
          if (removeId) {
            removeApprovalRule(removeId);
            toast.success("Band removed");
          }
        }}
      />
    </div>
  );
}

function RuleDialog({ rule, onClose }: { rule: ApprovalRule | null; onClose: () => void }) {
  const [draft, setDraft] = useState<ApprovalRule | null>(rule);
  useEffect(() => {
    setDraft(rule);
  }, [rule]);

  const set = (patch: Partial<ApprovalRule>) => setDraft((s) => (s ? { ...s, ...patch } : s));

  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule && !rule.id.startsWith("AR-") ? "Edit band" : "Approval band"}</DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Document type">
              <Select value={draft.documentType} onValueChange={(v) => set({ documentType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select value={draft.department} onValueChange={(v) => set({ department: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Min amount (NPR)">
              <Input type="number" value={draft.minAmount} onChange={(e) => set({ minAmount: Number(e.target.value) })} />
            </Field>
            <Field label="Max amount (blank = open)">
              <Input
                type="number"
                value={draft.maxAmount ?? ""}
                onChange={(e) => set({ maxAmount: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Approver role">
              <Select value={draft.approverRole} onValueChange={(v) => set({ approverRole: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Level">
              <Input type="number" min={1} value={draft.level} onChange={(e) => set({ level: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Mode">
              <Select value={draft.mode} onValueChange={(v) => set({ mode: v as ApprovalRule["mode"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Escalation hours">
              <Input type="number" min={1} value={draft.escalationHours} onChange={(e) => set({ escalationHours: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Auto-approve below">
              <Input type="number" min={0} value={draft.autoApproveBelow} onChange={(e) => set({ autoApproveBelow: Number(e.target.value) || 0 })} />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={draft.active} onCheckedChange={(on) => set({ active: on })} />
              <Label>Active</Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!draft) return;
              saveApprovalRule(draft);
              toast.success(`${draft.id} saved`);
              onClose();
            }}
          >
            Save band
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
