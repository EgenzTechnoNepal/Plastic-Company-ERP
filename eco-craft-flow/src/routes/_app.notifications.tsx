import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Boxes,
  CheckCheck,
  ClipboardCheck,
  Factory,
  ShieldAlert,
  ShoppingCart,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead, useNotifications } from "@/services/entityService";
import type { NotificationItem } from "@/types/erp";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

type FilterKey = "all" | "unread" | "inventory" | "approval" | "sales" | "production" | "quality" | "hr" | "system";

const CATEGORY_META: Record<Exclude<FilterKey, "all" | "unread">, { label: string; icon: LucideIcon }> = {
  inventory: { label: "Inventory", icon: Boxes },
  approval: { label: "Approvals", icon: ClipboardCheck },
  sales: { label: "Sales", icon: ShoppingCart },
  production: { label: "Production", icon: Factory },
  quality: { label: "Quality", icon: ShieldAlert },
  hr: { label: "HR", icon: UserCog },
  system: { label: "System", icon: Bell },
};

const FILTERS: FilterKey[] = ["all", "unread", "inventory", "approval", "sales", "production", "quality", "hr", "system"];

const PRIORITY_TONE = { high: "danger", normal: "warning", low: "neutral" } as const;

function categoryOf(n: NotificationItem): Exclude<FilterKey, "all" | "unread"> {
  switch (n.type) {
    case "stock":
      return "inventory";
    case "approval":
    case "rejection":
      return "approval";
    case "invoice":
      return "sales";
    case "production":
      return "production";
    case "quality":
      return "quality";
    case "leave":
    case "payroll":
      return "hr";
    default:
      return "system";
  }
}

function fmt(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString();
}

function NotificationsPage() {
  const items = useNotifications();
  const [filter, setFilter] = useState<FilterKey>("all");

  const unread = items.filter((n) => !n.read).length;
  const high = items.filter((n) => n.priority === "high" && !n.read).length;
  const approvals = items.filter((n) => categoryOf(n) === "approval" && !n.read).length;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => !n.read);
    return items.filter((n) => categoryOf(n) === filter);
  }, [items, filter]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stock alerts, approvals, production, quality and HR events in one feed"
        actions={
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              markAllNotificationsRead();
              toast.success("All notifications marked as read");
            }}
            disabled={!unread}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Unread" value={unread} icon={BellRing} hint="Needs attention" />
        <KpiCard label="High priority" value={high} icon={ShieldAlert} accent="secondary" hint="Act today" />
        <KpiCard label="Pending approvals" value={approvals} icon={ClipboardCheck} accent="accent" />
        <KpiCard label="Total" value={items.length} icon={Bell} accent="muted" />
      </div>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f === "all" || f === "unread" ? f : CATEGORY_META[f].label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here" description="No notifications match this filter." />
      ) : (
        <div className="space-y-3">
          {visible.map((n) => {
            const cat = categoryOf(n);
            const Icon = CATEGORY_META[cat].icon;
            return (
              <Card
                key={n.id}
                className={cn(
                  "rounded-2xl border-border/60 shadow-sm transition-colors",
                  !n.read && "border-primary/30 bg-primary/[0.04]",
                )}
              >
                <CardContent className="flex gap-3 p-4">
                  <div
                    className={cn(
                      "h-10 w-10 shrink-0 rounded-xl p-2.5",
                      n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <StatusBadge tone={PRIORITY_TONE[n.priority]}>{n.priority}</StatusBadge>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-xs text-muted-foreground">{fmt(n.at)}</span>
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id, !n.read)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {n.read ? "Mark unread" : "Mark read"}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
