import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta, type ApiMeta } from "./client";
import { resolveDefaultCompanyId } from "./crm";

export type MasterDataRow = Record<string, unknown> & { id: string; is_active?: boolean };

export interface MasterDataList<T extends MasterDataRow = MasterDataRow> {
  rows: T[];
  meta: ApiMeta;
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

export async function listMasterData<T extends MasterDataRow>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<MasterDataList<T>> {
  const { data, meta } = await apiFetchMeta<T[] | { results: T[] }>(path, {
    query: { page_size: 200, ...query },
    silent: true,
  });
  return { rows: unwrapList<T>(data), meta };
}

export async function getMasterData<T extends MasterDataRow>(path: string, id: string): Promise<T> {
  return apiFetch<T>(`${path}${id}/`, { silent: true });
}

export async function createMasterData<T extends MasterDataRow>(
  path: string,
  body: Record<string, unknown>,
  includeCompany = false,
): Promise<T> {
  const payload =
    includeCompany && !body.company ? { ...body, company: await resolveDefaultCompanyId() } : body;
  return apiFetch<T>(path, { method: "POST", body: payload, silent: true });
}

export async function updateMasterData<T extends MasterDataRow>(
  path: string,
  id: string,
  body: Record<string, unknown>,
): Promise<T> {
  return apiFetch<T>(`${path}${id}/`, { method: "PATCH", body, silent: true });
}

export const MASTER_DATA_API = {
  uoms: `${API_V1}/inventory/uoms/`,
  supplierItemPrices: `${API_V1}/inventory/supplier-item-prices/`,
  items: `${API_V1}/inventory/items/`,
  suppliers: `${API_V1}/purchase/vendors/`,
  currencies: `${API_V1}/organization/currencies/`,
  warehouses: `${API_V1}/warehouse/facilities/`,
  zones: `${API_V1}/warehouse/zones/`,
  racks: `${API_V1}/warehouse/racks/`,
  bins: `${API_V1}/warehouse/storage-bins/`,
} as const;
