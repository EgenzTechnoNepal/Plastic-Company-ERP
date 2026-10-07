import { organizationApi } from "./organization";

let cachedCompanyId: string | null = null;

export async function resolveCompanyContextId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;

  const companies = await organizationApi.companies();
  const activeCompany = companies.find((company) => company.is_active) ?? companies[0];
  if (!activeCompany) throw new Error("No company context available.");

  cachedCompanyId = activeCompany.id;
  return cachedCompanyId;
}
