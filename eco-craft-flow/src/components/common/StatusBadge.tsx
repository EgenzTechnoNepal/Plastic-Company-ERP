import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  success: "bg-primary/15 text-primary border-primary/30",
  warning: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", TONE[tone])}>
      {children}
    </Badge>
  );
}