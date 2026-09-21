import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Timer, UserCheck, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/common/KpiCard";
import { EntityListPage } from "@/components/common/EntityListPage";
import { DualDate } from "@/components/common/DualDate";
import { str, sumField } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/hr/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mode === "grid" ? "default" : "outline"} onClick={() => setMode("grid")}>
          Month grid
        </Button>
        <Button size="sm" variant={mode === "list" ? "default" : "outline"} onClick={() => setMode("list")}>
          Register
        </Button>
        {mode === "grid" && (
          <input
            type="month"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        )}
      </div>
      {mode === "grid" ? <AttendanceGrid month={month} /> : <AttendanceList />}
    </div>
  );
}

function AttendanceList() {
  return (
    <EntityListPage
      entity="attendance"
      extraFilters={[
        {
          key: "attStatus",
          placeholder: "All attendance",
          options: ["Present", "Absent", "Half Day", "Leave"].map((v) => ({ value: v, label: v })),
          match: (row, value) => String(row.fields.status ?? "") === value,
        },
      ]}
      kpis={(rows) => [
        { label: "Records", value: rows.length, icon: Clock },
        { label: "Present", value: rows.filter((r) => String(r.fields.status ?? "") === "Present").length, icon: UserCheck, accent: "accent" },
        { label: "Absent / Leave", value: rows.filter((r) => ["Absent", "Leave"].includes(String(r.fields.status ?? ""))).length, icon: UserX, accent: "muted" },
        { label: "OT Hours", value: sumField(rows, "overtime").toFixed(1), icon: Timer, accent: "secondary" },
      ]}
    />
  );
}

function AttendanceGrid({ month }: { month: string }) {
  const employees = useRecords("employees");
  const attendance = useRecords("attendance");
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);

  const byEmpDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of attendance) {
      if (!row.date?.startsWith(month)) continue;
      const emp = str(row, "employee") || str(row, "employeeName") || row.title;
      const day = Number(row.date.slice(8, 10));
      const mark = String(row.fields.status ?? "Present");
      map.set(`${emp}:${day}`, mark[0] ?? "P");
    }
    return map;
  }, [attendance, month]);

    const present = attendance.filter((r) => r.date?.startsWith(month) && String(r.fields.status ?? "") === "Present").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Employees" value={employees.length} icon={UserCheck} />
        <KpiCard label="Present marks" value={present} icon={Clock} accent="accent" />
        <KpiCard label="OT hours" value={sumField(attendance.filter((r) => r.date?.startsWith(month)), "overtime").toFixed(1)} icon={Timer} accent="secondary" />
        <KpiCard label="Month" value={month} icon={UserX} accent="muted" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Attendance · <DualDate value={`${month}-01`} />
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 bg-card py-2 text-left">Employee</th>
                {dayNums.map((d) => (
                  <th key={d} className="px-1 font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t">
                  <td className="sticky left-0 bg-card py-1.5 pr-3 font-medium">{emp.title}</td>
                  {dayNums.map((d) => {
                    const mark = byEmpDay.get(`${emp.code}:${d}`)
                      ?? byEmpDay.get(`${emp.title}:${d}`)
                      ?? "";
                    return (
                      <td key={d} className="px-1 text-center">
                        {mark ? (
                          <span className={mark === "A" || mark.startsWith("A") ? "text-destructive" : "text-primary"}>
                            {mark === "Present" ? "P" : mark.slice(0, 1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted-foreground">P present · A absent · L leave · H half day</p>
        </CardContent>
      </Card>
    </div>
  );
}
