import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarClock, Cog, Wrench } from "lucide-react";
import { DataListPage, type Column } from "@/components/common/DataListPage";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { GanttBoard } from "@/features/production/GanttBoard";
import { str } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/production/scheduling")({
  component: SchedulingPage,
});

interface SlotRow {
  id: string;
  machine: string;
  workOrder: string;
  product: string;
  date: string;
  shift: string;
  setupMins: number;
  runMins: number;
  utilisation: number;
  status: string;
}

function shiftOf(iso: string) {
  const h = new Date(iso).getHours();
  if (h < 14) return "morning";
  if (h < 22) return "evening";
  return "night";
}

const tone = (s: string) =>
  s === "completed" ? "success" : s === "running" ? "info" : s === "maintenance" ? "danger" : "warning";

function SchedulingPage() {
  const schedules = useRecords("machine_schedules");
  const workOrders = useRecords("work_orders");
  const productOf = (wo: string) => workOrders.find((w) => w.code === wo);

  const slots: SlotRow[] = schedules.flatMap((s) => {
    const raw = (s.fields.slots as Array<{ machine: string; workOrder: string; start: string; end: string; setupMins: number }>) ?? [];
    return raw.map((slot, i) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const span = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
        ? 0
        : Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
      const setupMins = slot.setupMins ?? 0;
      const runMins = Math.max(0, span - setupMins);
      const wo = productOf(slot.workOrder);
      return {
        id: `${s.id}-${i}`,
        machine: slot.machine,
        workOrder: slot.workOrder,
        product: wo ? str(wo, "product") : s.title,
        date: slot.start?.slice(0, 10) ?? s.date,
        shift: shiftOf(slot.start),
        setupMins,
        runMins,
        utilisation: Math.min(100, Math.round((runMins / 480) * 100)),
        status: s.status === "completed" ? "completed" : s.status === "released" ? "running" : "planned",
      };
    });
  });

  const running = slots.filter((m) => m.status === "running").length;
  const load = slots.length ? Math.round(slots.reduce((s, m) => s + m.utilisation, 0) / slots.length) : 0;
  const scheduledHours = Math.round(slots.reduce((s, m) => s + m.setupMins + m.runMins, 0) / 60);

  const columns: Array<Column<SlotRow>> = [
    {
      key: "machine",
      header: "Machine",
      cell: (m) => (
        <div>
          <div className="font-medium">{m.machine}</div>
          <div className="text-xs text-muted-foreground">{m.shift}</div>
        </div>
      ),
      value: (m) => m.machine,
    },
    {
      key: "order",
      header: "Work order",
      cell: (m) => (
        <div>
          <div className="font-mono text-xs">{m.workOrder}</div>
          <div className="text-xs text-muted-foreground">{m.product}</div>
        </div>
      ),
      value: (m) => m.workOrder,
    },
    { key: "date", header: "Date", cell: (m) => m.date, value: (m) => m.date },
    { key: "shift", header: "Shift", cell: (m) => <StatusBadge tone="neutral">{m.shift}</StatusBadge>, value: (m) => m.shift },
    { key: "setup", header: "Setup", align: "right", cell: (m) => `${m.setupMins} min`, value: (m) => m.setupMins },
    { key: "run", header: "Run", align: "right", cell: (m) => `${m.runMins} min`, value: (m) => m.runMins },
    {
      key: "utilisation",
      header: "Utilisation",
      cell: (m) => (
        <div className="min-w-28">
          <div className="mb-1 text-xs text-muted-foreground">{m.utilisation}%</div>
          <Progress value={m.utilisation} className="h-1.5" />
        </div>
      ),
      value: (m) => m.utilisation,
    },
    { key: "status", header: "Status", cell: (m) => <StatusBadge tone={tone(m.status)}>{m.status}</StatusBadge>, value: (m) => m.status },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Scheduled slots" value={slots.length} icon={CalendarClock} />
        <KpiCard label="Running now" value={running} icon={Cog} />
        <KpiCard label="Avg. load" value={`${load}%`} icon={Activity} accent="secondary" hint={`${scheduledHours} h scheduled`} />
        <KpiCard label="Schedules" value={schedules.length} icon={Wrench} accent="muted" />
      </div>

      {schedules[0] && <GanttBoard schedule={schedules[0]} />}

      <DataListPage
        rows={slots}
        rowKey={(m) => m.id}
        columns={columns}
        exportName="machine-schedule"
        searchPlaceholder="Search machine, order…"
        search={(m, q) => [m.machine, m.workOrder, m.product].some((v) => v.toLowerCase().includes(q))}
        filters={[
          {
            key: "shift",
            placeholder: "All shifts",
            options: ["morning", "evening", "night"].map((v) => ({ value: v, label: v })),
            match: (m, v) => m.shift === v,
          },
          {
            key: "status",
            placeholder: "All statuses",
            options: ["planned", "running", "completed"].map((v) => ({ value: v, label: v })),
            match: (m, v) => m.status === v,
          },
        ]}
        mobileCard={(m) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{m.machine}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.workOrder} · {m.product}
                </div>
              </div>
              <StatusBadge tone={tone(m.status)}>{m.status}</StatusBadge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {m.date} · {m.shift}
              </span>
              <span>{m.setupMins + m.runMins} min</span>
            </div>
            <Progress value={m.utilisation} className="h-1.5" />
          </div>
        )}
      />
    </div>
  );
}
