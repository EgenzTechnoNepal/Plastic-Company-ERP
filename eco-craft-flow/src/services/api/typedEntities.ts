import { ApiError } from "./client";

/** Entities that must not silently fall back to mock/localStorage in live sessions. */
export const M2_DEMO_TYPED_ENTITIES = new Set([
  "suppliers",
  "products",
  "warehouses",
  "bins",
  "purchase_orders",
  "proforma_invoices",
  "letters_of_credit",
  "shipments",
  "gate_entries",
  "grns",
  "purchase_bills",
  "sales_orders",
  "deliveries",
  "invoices",
  "qc_inspections",
  "landed_cost_documents",
  "inventory_lots",
  "stock_reservations",
  "stock_movements",
  "stock_transfers",
  "putaways",
  "customers",
  "contacts",
  "activities",
]);

export const M2_TYPED_DETAIL_ENTITIES = new Set([
  "purchase_orders",
  "proforma_invoices",
  "letters_of_credit",
  "shipments",
  "gate_entries",
  "grns",
  "qc_inspections",
  "landed_cost_documents",
  "inventory_lots",
  "stock_reservations",
  "stock_transfers",
  "putaways",
  "suppliers",
  "customers",
  "contacts",
  "activities",
  "sales_orders",
  "deliveries",
  "invoices",
]);

/** CRM workflows still backed only by legacy DomainRecord compatibility endpoints. */
export const LIVE_UNSUPPORTED_DOMAIN_ENTITIES = new Set(["leads", "opportunities", "quotations"]);

export function liveDomainEntityUnavailable(entity: string): ApiError {
  const label = entity.replace(/_/g, " ");
  return new ApiError(
    "LIVE_DOMAIN_RESOURCE_UNAVAILABLE",
    `${label} are unavailable in live mode because the backend does not expose a canonical typed CRM API for this workflow.`,
    501,
  );
}

/** Typed entities with create endpoints wired to the frontend API adapters. */
export const LIVE_TYPED_CREATE_ENTITIES = new Set([
  "suppliers",
  "products",
  "warehouses",
  "purchase_orders",
  "proforma_invoices",
  "letters_of_credit",
  "shipments",
  "landed_cost_documents",
  "sales_orders",
  "deliveries",
  "invoices",
  "customers",
  "contacts",
  "activities",
]);

/** Typed entities with update endpoints wired to the frontend API adapters. */
export const LIVE_TYPED_EDIT_ENTITIES = new Set([
  "suppliers",
  "products",
  "warehouses",
  "proforma_invoices",
  "letters_of_credit",
  "shipments",
  "landed_cost_documents",
  "customers",
  "contacts",
  "activities",
]);

export function isTypedEntity(entity: string): boolean {
  return M2_DEMO_TYPED_ENTITIES.has(entity);
}

/**
 * Typed entities have no DomainRecord authority. When the generic screen asks for an
 * operation the typed API does not expose, fail loudly instead of writing a legacy record.
 */
export function typedUnavailable(entity: string, operation: string): ApiError {
  const label = entity.replace(/_/g, " ");
  return new ApiError(
    "TYPED_ACTION_UNAVAILABLE",
    `${operation} for ${label} is not available from this screen yet. No changes were saved.`,
    501,
  );
}
