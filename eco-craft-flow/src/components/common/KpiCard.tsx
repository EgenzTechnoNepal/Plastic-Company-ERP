import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; positive?: boolean };
  accent?: "primary" | "accent" | "secondary" | "muted";
}

export function KpiCard({ label, value, hint, icon: Icon, trend, accent = "primary" }: KpiCardProps) {
  const accentBg: Record<NonNullable<KpiCardProps["accent"]>, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent-foreground",
    secondary: "bg-secondary/15 text-secondary",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          {Icon && (
            <div className={cn("shrink-0 rounded-xl p-2.5", accentBg[accent])}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
        {trend && (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              trend.positive ? "text-primary" : "text-destructive",
            )}
          >
            {trend.positive ? "▲" : "▼"} {trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}