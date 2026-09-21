import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, Truck, Boxes, Factory, Wallet, WandSparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports")({ component: ReportsLayout });

const TABS = [
  { to: "/reports/sales", label: "Sales", icon: ShoppingCart },
  { to: "/reports/purchase", label: "Purchase", icon: Truck },
  { to: "/reports/inventory", label: "Inventory", icon: Boxes },
  { to: "/reports/production", label: "Production & QC", icon: Factory },
  { to: "/reports/financial", label: "Financial", icon: Wallet },
  { to: "/reports/builder", label: "Builder", icon: WandSparkles },
] as const;

function ReportsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filter, review and export operational and financial reports"
      />
      <div className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
        <nav className="inline-flex min-w-full gap-1 rounded-lg border bg-card p-1 sm:min-w-0">
          {TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
