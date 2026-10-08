import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileText,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import {
  DASHBOARD_COUNT_ENDPOINTS,
  useDashboardCount,
  useDashboardSummary,
} from "@/services/api/dashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

type MetricCardProps = {
  label: string;
  icon: typeof ShoppingCart;
  value?: number;
  loading: boolean;
  error?: Error | null;
  unavailable?: boolean;
  live: boolean;
  hint?: string;
  onRetry?: () => void;
  accent?: "primary" | "accent" | "secondary" | "muted";
};

function MetricCard({
  label,
  icon: Icon,
  value,
  loading,
  error,
  unavailable,
  live,
  hint,
  onRetry,
  accent = "primary",
}: MetricCardProps) {
  const accentBg = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent-foreground",
    secondary: "bg-secondary/15 text-secondary",
    muted: "bg-muted text-muted-foreground",
  }[accent];

  let displayValue: string | number = "Sign in for backend data";
  let detail = hint;
  if (!live) {
    displayValue = "Not connected";
  } else if (loading) {
    displayValue = "Loading…";
  } else if (error) {
    displayValue = "Unavailable";
    detail = error.message;
  } else if (unavailable) {
    displayValue = "Not available";
    detail = [hint, "BACKEND AGGREGATE REQUIRED"].filter(Boolean).join(" · ");
  } else if (value !== undefined) {
    displayValue = value;
  } else {
    displayValue = "Unavailable";
    detail = "The backend did not return a count.";
  }

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight">
              {displayValue}
            </p>
            {detail && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  error ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {detail}
              </p>
            )}
            {error && onRetry && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0"
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
            {loading && <span className="sr-only" role="status">Loading {label}</span>}
            {error && <span className="sr-only" role="alert">Could not load {label}</span>}
          </div>
          <div className={cn("shrink-0 rounded-xl p-2.5", accentBg)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const live = useAuthStore((state) => state.source === "api");
  const summary = useDashboardSummary();
  const pendingGrns = useDashboardCount("pending-grns", DASHBOARD_COUNT_ENDPOINTS.goodsReceipts, {
    status: "DRAFT",
  });
  const openReservations = useDashboardCount("open-reservations", DASHBOARD_COUNT_ENDPOINTS.reservations, {
    status: "OPEN",
  });

  const refresh = () => {
    void Promise.all([summary.refetch(), pendingGrns.refetch(), openReservations.refetch()]);
  };

  const summaryMetric = {
    loading: summary.isLoading,
    error: summary.error,
    onRetry: () => void summary.refetch(),
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
        description={
          live
            ? "Live operational counts from the backend."
            : "Sign in with the ERP backend to load operational counts."
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={!live || summary.isFetching || pendingGrns.isFetching || openReservations.isFetching}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link to="/sales">
                <ShoppingCart className="mr-2 h-4 w-4" /> Sales Orders
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <MetricCard
          label="Open Purchase Orders"
          icon={Truck}
          value={summary.data?.purchase.open_purchase_orders}
          {...summaryMetric}
          live={live}
          hint="Backend open-order statuses"
          accent="secondary"
        />
        <MetricCard
          label="Pending GRNs"
          icon={Warehouse}
          value={pendingGrns.data}
          loading={pendingGrns.isLoading}
          error={pendingGrns.error}
          onRetry={() => void pendingGrns.refetch()}
          live={live}
          hint="Draft GRNs"
        />
        <MetricCard
          label="QC Pending"
          icon={AlertTriangle}
          value={summary.data?.quality.open_inspections}
          {...summaryMetric}
          live={live}
          hint="Draft inspections"
          accent="muted"
        />
        <MetricCard
          label="Available Inventory"
          icon={Boxes}
          loading={false}
          unavailable
          live={live}
          hint="Global available quantity is not exposed by the backend."
          accent="accent"
        />
        <MetricCard
          label="Low Stock"
          icon={PackageCheck}
          loading={false}
          unavailable
          live={live}
          hint="No authoritative global availability and reorder aggregate exists."
          accent="muted"
        />
        <MetricCard
          label="Open Sales Orders"
          icon={ClipboardList}
          value={summary.data?.sales.open_sales_orders}
          {...summaryMetric}
          live={live}
          hint="Backend open-order statuses"
        />
        <MetricCard
          label="Open Reservations"
          icon={PackageCheck}
          value={openReservations.data}
          loading={openReservations.isLoading}
          error={openReservations.error}
          onRetry={() => void openReservations.refetch()}
          live={live}
          hint="Backend OPEN status"
          accent="secondary"
        />
        <MetricCard
          label="Posted Dispatches"
          icon={Truck}
          value={summary.data?.sales.posted_dispatches}
          {...summaryMetric}
          live={live}
          hint="Posted dispatch notes"
        />
        <MetricCard
          label="Posted Invoices"
          icon={FileText}
          value={summary.data?.sales.posted_invoices}
          {...summaryMetric}
          live={live}
          hint="Posted sales invoices"
          accent="accent"
        />
      </div>
    </div>
  );
}
