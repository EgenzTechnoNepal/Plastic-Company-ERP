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
  "stock_movements",
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
