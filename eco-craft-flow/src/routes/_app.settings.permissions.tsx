import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/constants/roles";
import { ENTITIES } from "@/features/registry/entities";
import {
  MATRIX_ROLES,
  PERM_ACTIONS,
  PERM_SCREENS,
  can,
  defaultFieldAccess,
  fieldAccess,
  resetRolePermissions,
  setFieldPermission,
  setPermission,
} from "@/lib/permissions";
import { logAudit } from "@/services/entityService";
import { useDb } from "@/services/mock/db";
import type { FieldAccess } from "@/types/erp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings/permissions")({
  component: PermissionMatrixPage,
});

function PermissionMatrixPage() {
  useDb((s) => s.permissionOverrides);
  useDb((s) => s.fieldOverrides);
  const [role, setRole] = useState<Role>("sales");
  const [tab, setTab] = useState<"screens" | "fields">("screens");
  const [entity, setEntity] = useState("customers");
  const screensByModule = useMemo(() => {
    const map = new Map<string, typeof PERM_SCREENS>();
    for (const s of PERM_SCREENS) {
      const arr = map.get(s.module) ?? [];
      arr.push(s);
      map.set(s.module, arr);
    }
    return Array.from(map.entries());
  }, []);
  const def = ENTITIES.find((e) => e.key === entity);

  return (
    <div>
      <PageHeader
        title="Permission matrix"
        description="Module × screen × action, plus field-level hidden / read-only / edit. Administrator is always allowed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">
                <ArrowLeft className="mr-1 h-4 w-4" /> Settings
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetRolePermissions(role);
                logAudit({ action: "edit", module: "settings", entity: "permissions", recordCode: role, reason: "Reset to defaults" });
                toast.success(`${ROLE_LABELS[role]} reset to defaults`);
              }}
            >
              Reset {ROLE_LABELS[role]}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATRIX_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
          <button
            type="button"
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === "screens" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            onClick={() => setTab("screens")}
          >
            Screens
          </button>
          <button
            type="button"
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === "fields" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            onClick={() => setTab("fields")}
          >
            Fields
          </button>
        </div>
      </div>

      {tab === "screens" && (
        <div className="space-y-4">
          {screensByModule.map(([module, screens]) => (
            <Card key={module} className="rounded-2xl border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize">{module.replace(/-/g, " ")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Screen</th>
                      {PERM_ACTIONS.map((a) => (
                        <th key={a} className="px-1 py-2 text-center font-medium capitalize">
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {screens.map((s) => (
                      <tr key={s.screen} className="border-b last:border-0">
                        <td className="py-2 pr-3 capitalize">{s.label}</td>
                        {PERM_ACTIONS.map((action) => {
                          const checked = can(role, action, s.module, s.screen);
                          return (
                            <td key={action} className="px-1 py-2 text-center">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setPermission(role, s.module, s.screen, action, Boolean(v));
                                  logAudit({
                                    action: "edit",
                                    module: "settings",
                                    entity: "permissions",
                                    recordCode: `${role}/${s.module}/${s.screen}/${action}`,
                                    after: { allowed: Boolean(v) },
                                  });
                                }}
                                aria-label={`${s.label} ${action}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "fields" && (
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Field access</CardTitle>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITIES.map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {def?.fields.map((f) => {
              const access = fieldAccess(role, entity, f.key);
              const fallback = defaultFieldAccess(role, entity, f.key);
              return (
                <div key={f.key} className="flex flex-col gap-2 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.key} · default {fallback}
                    </p>
                  </div>
                  <Select
                    value={access}
                    onValueChange={(v) => {
                      setFieldPermission(role, entity, f.key, v as FieldAccess);
                      logAudit({
                        action: "edit",
                        module: "settings",
                        entity: "field_permissions",
                        recordCode: `${role}/${entity}/${f.key}`,
                        after: { access: v },
                      });
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="readonly">Read only</SelectItem>
                      <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
