/** Live dashboard KPIs from /system/dashboard-summary/ */
import { useQuery } from "@tanstack/react-query";
import { API_V1 } from "./endpoints";
import { apiFetch } from "./client";
import { resolveDefaultCompanyId } from "./crm";
import { useAuthStore } from "@/store/auth";

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
