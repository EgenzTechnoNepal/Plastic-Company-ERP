import { Link, Outlet, useRouterState, type LinkProps } from "@tanstack/react-router";
import { Plus, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  to: LinkProps["to"];
  label: string;
  icon: LucideIcon;
  /** Key in FORM_DEFINITIONS — presence means this tab can create records. */
  formKey?: string;
  formLabel?: string;
}

interface ModuleTabsLayoutProps {
  title: string;
  description: string;
  tabs: readonly ModuleTab[];
}

/**
 * Shared chrome for every module: page header with a context-aware
 * "new record" action, a horizontally scrollable tab bar on mobile,
 * and the routed child screen.
 *
 * Detail / new / edit routes (`/:module/:entity/$id`) skip the tab bar
 * so RecordHeader owns the page chrome.
 */
export function ModuleTabsLayout({ title, description, tabs }: ModuleTabsLayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  const isRecordView = parts.length > 2;
  const active = tabs.find((t) => pathname === String(t.to) || pathname.startsWith(String(t.to) + "/")) ?? tabs[0];

  if (isRecordView) return <Outlet />;

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          active?.formKey ? (
            <PermissionGuard action="create" module={parts[0]}>
              <Button size="sm" className="gap-2" asChild>
                <Link to={`${String(active.to)}/new` as never}>
                  <Plus className="h-4 w-4" />
                  {active.formLabel ?? "New"}
                </Link>
              </Button>
            </PermissionGuard>
          ) : null
        }
      />
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="inline-flex min-w-full gap-1 rounded-lg border bg-card p-1 sm:min-w-0">
          {tabs.map((tab) => {
            const isActive = pathname === String(tab.to) || pathname.startsWith(String(tab.to) + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={String(tab.to)}
                to={tab.to}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
