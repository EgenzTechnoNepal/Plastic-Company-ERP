import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PermissionGuard } from "@/lib/permissions";
import { str } from "@/lib/records";
import { detectConflicts, shiftScheduleSlot, slotsOf } from "@/features/production/cycle";
import { useRecord, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

function hourOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getHours() + d.getMinutes() / 60;
}

export function GanttBoard({ schedule }: { schedule?: ErpRecord }) {
  const schedules = useRecords("machine_schedules");
  const machines = useRecords("machines");
  const live = useRecord("machine_schedules", schedule?.code ?? schedules[0]?.code ?? "");
  const current = live ?? schedule ?? schedules[0];
  if (!current) {
    return <p className="text-sm text-muted-foreground">No machine schedule yet.</p>;
  }
  const slots = slotsOf(current);
  const conflicts = detectConflicts(current);
  const machineIds = Array.from(new Set([...machines.map((m) => m.code), ...slots.map((s) => s.machine)]));

  const shift = async (index: number, hours: number) => {
    try {
      await shiftScheduleSlot(current, index, hours);
      toast.success(`Slot shifted ${hours > 0 ? "+" : ""}${hours}h`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Shift failed");
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Machine Gantt · {str(current, "week")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Shift slots by two hours. Overlap and maintenance windows are flagged as conflicts (full drag-and-drop ships with the plant Gantt later).
        </p>
        {conflicts.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}: {conflicts.map((c) => c.reason).join(" · ")}
          </div>
        )}
        <div className="space-y-2">
          {machineIds.map((machine) => {
            const row = slots.map((s, i) => ({ ...s, index: i })).filter((s) => s.machine === machine);
            const maint = machines.find((m) => m.code === machine);
            const windows = Array.isArray(maint?.fields.maintenanceWindows)
              ? (maint!.fields.maintenanceWindows as Array<{ start: string; end: string }>)
              : [];
            return (
              <div key={machine} className="rounded-lg border p-2">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{machine}</span>
                  <span className="text-xs text-muted-foreground">{maint ? str(maint, "workCentre") : ""}</span>
                </div>
                <div className="relative h-10 overflow-hidden rounded bg-muted/40">
                  {windows.map((w, i) => (
                    <div
                      key={`m-${i}`}
                      className="absolute top-0 h-full bg-destructive/30"
                      style={{ left: `${(hourOf(w.start) / 24) * 100}%`, width: `${Math.max(4, ((hourOf(w.end) - hourOf(w.start)) / 24) * 100)}%` }}
                      title="Maintenance"
                    />
                  ))}
                  {row.map((s) => {
                    const hit = conflicts.some((c) => c.index === s.index);
                    return (
                      <div
                        key={s.index}
                        className={`absolute top-1 h-8 rounded px-1 text-[10px] leading-8 text-primary-foreground ${hit ? "bg-destructive" : "bg-primary"}`}
                        style={{
                          left: `${(hourOf(s.start) / 24) * 100}%`,
                          width: `${Math.max(8, ((hourOf(s.end) - hourOf(s.start)) / 24) * 100)}%`,
                        }}
                        title={`${s.workOrder} ${s.start.slice(11, 16)}–${s.end.slice(11, 16)}`}
                      >
                        {s.workOrder}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.map((s) => (
                    <div key={s.index} className="flex items-center gap-1 text-xs">
                      <StatusBadge tone={conflicts.some((c) => c.index === s.index) ? "danger" : "info"}>
                        {s.start.slice(11, 16)}–{s.end.slice(11, 16)}
                      </StatusBadge>
                      <PermissionGuard action="edit">
                        <Button size="sm" variant="outline" onClick={() => shift(s.index, -2)}>−2h</Button>
                        <Button size="sm" variant="outline" onClick={() => shift(s.index, 2)}>+2h</Button>
                      </PermissionGuard>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
