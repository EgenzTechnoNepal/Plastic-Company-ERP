import type { ErpRecord } from "@/types/erp";
import { num, str } from "@/lib/records";
import type { ImportRow } from "@/lib/import";
import { numField, strField } from "@/lib/import";
import { availableQty } from "@/features/inventory/analytics";
import { getService } from "@/services/catalog";
import { nextCode } from "@/services/entityService";
import { db } from "@/services/mock/db";

export const PRODUCT_PLANNING_TEMPLATE = [
  "ITM Code",
  "Product Name",
  "Product Type",
  "Base UOM",
  "MOQ",
  "Reorder Level",
  "Reorder Quantity",
  "Safety Stock",
  "Max Stock",
  "Lead Time Days",
  "Standard Rate",
  "Preferred Supplier",
] as const;

export const WAREHOUSE_PLANNING_TEMPLATE = [
  "ITM Code",
  "Warehouse",
  "MOQ",
  "Reorder Level",
  "Reorder Quantity",
  "Safety Stock",
  "Max Stock",
  "Lead Time Days",
  "Preferred Supplier",
] as const;

export function findWarehousePlan(productCode: string, warehouse?: string) {
  const plans = db.get().records.warehouse_item_plans ?? [];
  const wh = warehouse || str(db.get().records.products?.find((p) => p.code === productCode) ?? ({} as ErpRecord), "warehouse");
  return (
    plans.find((p) => str(p, "product") === productCode && str(p, "warehouse") === wh) ??
    plans.find((p) => str(p, "product") === productCode)
  );
}

export function reorderQty(product: ErpRecord, plan?: ErpRecord) {
  const explicit = num(plan ?? product, "reorderQuantity");
  if (explicit > 0) return explicit;
  const moq = num(plan ?? product, "moq") || num(product, "moq") || 1;
  const need = num(plan ?? product, "reorderLevel") + num(plan ?? product, "safetyStock") - availableQty(product);
  return Math.max(moq, need);
}

export type AlertKind = "Stock-out" | "Below MOQ" | "Reorder" | "Over-stock" | "OK";

export function planningParams(product: ErpRecord, plan?: ErpRecord) {
  const src = plan ?? product;
  return {
    moq: num(src, "moq") || num(product, "moq"),
    reorderLevel: num(src, "reorderLevel") || num(product, "reorderLevel"),
    safetyStock: num(src, "safetyStock") || num(product, "safetyStock"),
    maxStock: num(src, "maxStock") || num(product, "maxStock"),
    leadTimeDays: num(src, "leadTimeDays") || num(product, "leadTimeDays"),
    preferredSupplier: str(src, "preferredSupplier") || str(product, "preferredSupplier"),
    reorderQuantity: reorderQty(product, plan),
  };
}

export function alertKind(product: ErpRecord, plan?: ErpRecord): AlertKind {
  const available = availableQty(product);
  const onHand = num(product, "onHand");
  const p = planningParams(product, plan);
  if (available <= 0) return "Stock-out";
  if (p.moq > 0 && available < p.moq) return "Below MOQ";
  if (p.reorderLevel > 0 && available <= p.reorderLevel) return "Reorder";
  if (p.maxStock > 0 && onHand > p.maxStock) return "Over-stock";
  return "OK";
}

export function isPlanningAlert(product: ErpRecord, plan?: ErpRecord) {
  return alertKind(product, plan) !== "OK";
}

export async function importProductPlanningRows(rows: ImportRow[]) {
  const svc = getService("products");
  const list = await svc.list();
  let updated = 0;
  let created = 0;
  for (const row of rows) {
    const code = strField(row, "itm_code", "code", "sku");
    if (!code) continue;
    const fields: Record<string, unknown> = {
      name: strField(row, "product_name", "name"),
      type: strField(row, "product_type", "type"),
      uom: strField(row, "base_uom", "uom"),
      moq: numField(row, "moq"),
      reorderLevel: numField(row, "reorder_level"),
      reorderQuantity: numField(row, "reorder_quantity"),
      safetyStock: numField(row, "safety_stock"),
      maxStock: numField(row, "max_stock"),
      leadTimeDays: numField(row, "lead_time_days", "lead_time"),
      rate: numField(row, "standard_rate", "rate"),
      preferredSupplier: strField(row, "preferred_supplier", "supplier"),
    };
    const existing = list.find((p) => p.code === code);
    if (existing) {
      await svc.update(existing.id, {
        title: String(fields.name || existing.title),
        fields: { ...existing.fields, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "" && v !== 0)) },
      });
      updated += 1;
    } else if (fields.name) {
      await svc.create({
        code,
        title: String(fields.name),
        status: "active",
        fields,
      });
      created += 1;
    }
  }
  return { updated, created };
}

export async function importWarehousePlanningRows(rows: ImportRow[]) {
  const svc = getService("warehouse_item_plans");
  const products = db.get().records.products ?? [];
  let upserted = 0;
  for (const row of rows) {
    const product = strField(row, "itm_code", "code", "product");
    const warehouse = strField(row, "warehouse", "wh");
    if (!product || !warehouse) continue;
    const prod = products.find((p) => p.code === product);
    const fields: Record<string, unknown> = {
      product,
      warehouse,
      productName: prod?.title ?? product,
      moq: numField(row, "moq"),
      reorderLevel: numField(row, "reorder_level"),
      reorderQuantity: numField(row, "reorder_quantity"),
      safetyStock: numField(row, "safety_stock"),
      maxStock: numField(row, "max_stock"),
      leadTimeDays: numField(row, "lead_time_days", "lead_time"),
      preferredSupplier: strField(row, "preferred_supplier", "supplier"),
    };
    const existing = (db.get().records.warehouse_item_plans ?? []).find(
      (p) => str(p, "product") === product && str(p, "warehouse") === warehouse,
    );
    if (existing) {
      await svc.update(existing.id, { fields: { ...existing.fields, ...fields } });
    } else {
      await svc.create({
        code: nextCode("warehouse_item_plans"),
        title: `${product} @ ${warehouse}`,
        status: "active",
        fields,
      });
    }
    upserted += 1;
  }
  return { upserted };
}
