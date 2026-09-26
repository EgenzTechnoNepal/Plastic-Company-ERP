/**
 * Phase 1 typed master API paths.
 * Existing DomainRecord screens keep using ENDPOINTS.products / suppliers / warehouses.
 * Use these when wiring forms to the typed Django source of truth.
 */
import { API_V1 } from "./endpoints";

export const PHASE1_TYPED_API = {
  items: `${API_V1}/inventory/items/`,
  uoms: `${API_V1}/inventory/uoms/`,
  uomConvert: `${API_V1}/inventory/uom-conversions/convert/`,
  lots: `${API_V1}/inventory/lots/`,
  lotTransition: (id: string) => `${API_V1}/inventory/lots/${id}/transition/`,
  landedCostDocuments: `${API_V1}/inventory/landed-cost-documents/`,
  landedCostPreview: (id: string) => `${API_V1}/inventory/landed-cost-documents/${id}/preview/`,
  landedCostComponents: `${API_V1}/inventory/landed-cost-components/`,
  vendors: `${API_V1}/purchase/vendors/`,
  incoterms: `${API_V1}/purchase/incoterms/`,
  facilities: `${API_V1}/warehouse/facilities/`,
  storageBins: `${API_V1}/warehouse/storage-bins/`,
  currencies: `${API_V1}/organization/currencies/`,
  taxCategories: `${API_V1}/organization/tax-categories/`,
  taxRates: `${API_V1}/organization/tax-rates/`,
  customerMasters: `${API_V1}/crm/customer-masters/`,
} as const;

export type LandedCostPreview = {
  document_id: string;
  document_number: string;
  purchase_quantity: string;
  purchase_unit_cost: string;
  purchase_value: string;
  additional_costs_total: string;
  landed_total: string;
  landed_unit_cost: string | null;
  components: Array<{
    id: string;
    category: string;
    amount: string;
    currency: string | null;
    exchange_rate: string;
    base_currency_amount: string;
    allocation_basis: string;
  }>;
};
