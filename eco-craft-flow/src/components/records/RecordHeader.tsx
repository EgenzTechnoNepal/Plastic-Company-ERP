import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { statusLabel, statusTone } from "@/lib/records";
import type { DocStatus } from "@/types/erp";

interface RecordHeaderProps {
  code: string;
  title: string;
  status: DocStatus | string;
  backTo: string;
  backLabel?: string;
  subtitle?: string;
  actions?: ReactNode;
  onBack?: () => void;
}

export function RecordHeader({ code, title, status, backTo, backLabel = "Back to list", subtitle, actions, onBack }: RecordHeaderProps) {
  return (
    <div className="mb-6 space-y-3">
      {onBack ? (
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" asChild>
          <Link to={backTo as never}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{code}</span>
            <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function RecordDetailLayout({
  header,
  main,
  sidebar,
}: {
  header: ReactNode;
  main: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">{main}</div>
        {sidebar && <aside className="space-y-4">{sidebar}</aside>}
      </div>
    </div>
  );
}
