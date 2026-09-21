import { formatDualDate, useCalendar } from "@/lib/nepalDate";

export function DualDate({ value, className }: { value?: string; className?: string }) {
  const { pref } = useCalendar();
  const { ad, bs } = formatDualDate(value);
  if (ad === "—") return <span className={className}>—</span>;
  if (pref === "bs") {
    return (
      <span className={className} title={`AD ${ad}`}>
        {bs} <span className="text-muted-foreground">BS</span>
      </span>
    );
  }
  return (
    <span className={className} title={`BS ${bs}`}>
      {ad} <span className="text-muted-foreground">AD</span>
      <span className="ml-1 text-[11px] text-muted-foreground">· {bs} BS</span>
    </span>
  );
}
