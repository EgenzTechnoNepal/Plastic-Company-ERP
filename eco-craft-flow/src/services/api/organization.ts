import { apiFetch, apiFetchMeta } from "./client";

export interface CompanyDto {
  id: string;
  name: string;
  legal_name: string;
  pan_vat_number: string;
  address: string;
  base_currency: string;
  logo: string | null;
  is_active: boolean;
}

export interface BranchDto {
  id: string;
  company: string;
  code: string;
  name: string;
  address: string;
  is_head_office: boolean;
  is_active: boolean;
}

export interface DepartmentDto {
  id: string;
  company: string;
  code: string;
  name: string;
  parent: string | null;
  is_active: boolean;
}

export interface FiscalYearDto {
  id: string;
  company: string;
  code: string;
  start_date: string;
  end_date: string;
  start_date_bs?: string;
  end_date_bs?: string;
  status: "open" | "closed" | "locked";
}

export interface FiscalPeriodDto {
  id: string;
  fiscal_year: string;
  code: string;
  month_number: number;
  start_date: string;
  end_date: string;
  status: "open" | "closed" | "locked";
}

export interface NumberingSeriesDto {
  id: string;
  document_type: string;
  prefix: string;
  padding: number;
  is_branch_aware: boolean;
  is_fiscal_year_aware: boolean;
}

async function listAll<T>(path: string): Promise<T[]> {
  const { data } = await apiFetchMeta<T[]>(path, { query: { page_size: 200 }, silent: true });
  return Array.isArray(data) ? data : [];
}

export const organizationApi = {
  companies: () => listAll<CompanyDto>("/organization/companies/"),
  getCompany: (id: string) => apiFetch<CompanyDto>(`/organization/companies/${id}/`, { silent: true }),
  patchCompany: (id: string, body: Partial<CompanyDto>) =>
    apiFetch<CompanyDto>(`/organization/companies/${id}/`, { method: "PATCH", body, silent: true }),
  branches: () => listAll<BranchDto>("/organization/branches/"),
  departments: () => listAll<DepartmentDto>("/organization/departments/"),
  fiscalYears: () => listAll<FiscalYearDto>("/organization/fiscal-years/"),
  fiscalPeriods: (fiscalYear?: string) =>
    listAll<FiscalPeriodDto>("/organization/fiscal-periods/").then((rows) =>
      fiscalYear ? rows.filter((p) => p.fiscal_year === fiscalYear) : rows,
    ),
  patchFiscalPeriod: (id: string, body: Partial<Pick<FiscalPeriodDto, "status">>) =>
    apiFetch<FiscalPeriodDto>(`/organization/fiscal-periods/${id}/`, { method: "PATCH", body, silent: true }),
  numberingSeries: () => listAll<NumberingSeriesDto>("/system/numbering-series/"),
};
