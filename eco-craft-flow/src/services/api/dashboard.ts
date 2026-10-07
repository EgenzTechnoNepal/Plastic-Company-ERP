/** Live dashboard KPIs from /system/dashboard-summary/ */
import { useQuery } from "@tanstack/react-query";
import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta } from "./client";
import { resolveDefaultCompanyId } from "./crm";
import { useAuthStore } from "@/store/auth";
import { PHASE2_TYPED_API } from "./phase2";
import { PHASE3_TYPED_API } from "./phase3";

export type DashboardSummary = {
  company_id: string;
  company_name: string;
  masters: {
    customers: number;
    suppliers: number;
    items: number;
    warehouses: number;
    bins: number;
  };
  inventory: {
    lots_available: number;
    lots_qc_hold: number;
    lots_quarantined: number;
    lots_rejected: number;
    reserved_quantity: string;
  };
  purchase: {
    open_purchase_orders: number;
    posted_grns: number;
    open_po_line_value: string;
    supplier_bills: number;
  };
  sales: {
    open_sales_orders: number;
    posted_dispatches: number;
    posted_invoices: number;
    posted_invoice_total: string;
  };
  quality: {
    open_inspections: number;
    passed: number;
    failed: number;
  };
  workflow: {
    pending_approvals: number;
  };
};

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const company = await resolveDefaultCompanyId();
  return apiFetch<DashboardSummary>(`${API_V1}/system/dashboard-summary/`, {
    query: { company },
    silent: true,
  });
}

export function useDashboardSummary() {
  const live = useAuthStore((s) => s.source === "api");
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
    enabled: live,
    staleTime: 15_000,
    retry: 1,
  });
}

export const DASHBOARD_COUNT_ENDPOINTS = {
  purchaseOrders: PHASE3_TYPED_API.purchaseOrders,
  goodsReceipts: PHASE2_TYPED_API.goodsReceipts,
  inspections: PHASE2_TYPED_API.lotInspections,
  salesOrders: PHASE3_TYPED_API.salesOrders,
  reservations: PHASE2_TYPED_API.reservations,
  dispatches: PHASE3_TYPED_API.dispatchNotes,
  invoices: PHASE3_TYPED_API.salesInvoices,
} as const;

export async function fetchDashboardCount(
  path: string,
  filters: { status?: string } = {},
): Promise<number> {
  const company = await resolveDefaultCompanyId();
  const { meta } = await apiFetchMeta<unknown>(path, {
    query: { company, page_size: 1, ...filters },
    silent: true,
  });
  if (typeof meta.count !== "number" || !Number.isFinite(meta.count)) {
    throw new Error("The backend list response did not include a total count.");
  }
  return meta.count;
}

export function useDashboardCount(
  metric: string,
  path: string,
  filters: { status?: string } = {},
) {
  const live = useAuthStore((s) => s.source === "api");
  return useQuery({
    queryKey: ["dashboard-summary", "kpi", metric, filters],
    queryFn: () => fetchDashboardCount(path, filters),
    enabled: live,
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
  });
}
