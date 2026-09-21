import { getService } from "@/services/catalog";
import { logAudit, notify } from "@/services/entityService";
import { db } from "@/services/mock/db";
import { isLowStock, str } from "@/lib/records";
import type { ErpRecord } from "@/types/erp";

function byCode(entity: string, code: string) {
  return (db.get().records[entity] ?? []).find((r) => r.code === code || r.id === code);
}

/** Close a reorder alert when on-hand recovers above the reorder level. */
export async function notifyRecoveredAlerts(product: ErpRecord): Promise<ErpRecord> {
  const fresh = byCode("products", product.code) ?? product;
  if (isLowStock(fresh)) return fresh;
  if (str(fresh, "alertOpen") !== "Yes") return fresh;
  const updated = await getService("products").update(fresh.id, {
    fields: { ...fresh.fields, alertOpen: "No", alertClosedAt: new Date().toISOString().slice(0, 10) },
  });
  logAudit({
    action: "edit",
    module: "inventory",
    entity: "products",
    recordId: updated.id,
    recordCode: updated.code,
    after: { alertOpen: "No" },
    reason: "Stock recovered above reorder",
  });
  notify({
    type: "stock",
    priority: "normal",
    title: `${updated.code} back above reorder`,
    body: "The low-stock alert closed automatically after the receipt / transfer.",
    module: "inventory",
    link: { entity: "products", id: updated.id },
  });
  return updated;
}

/** Open or close the reorder flag after a stock movement. */
export async function syncReorderAlert(product: ErpRecord): Promise<ErpRecord> {
  const fresh = byCode("products", product.code) ?? product;
  if (isLowStock(fresh)) {
    if (str(fresh, "alertOpen") === "Yes") return fresh;
    const updated = await getService("products").update(fresh.id, {
      fields: { ...fresh.fields, alertOpen: "Yes", alertOpenedAt: new Date().toISOString().slice(0, 10) },
    });
    notify({
      type: "stock",
      priority: "high",
      title: `${updated.code} below reorder`,
      body: `On hand dropped to ${Number(updated.fields.onHand ?? 0).toLocaleString()} vs reorder ${Number(updated.fields.reorderLevel ?? 0).toLocaleString()}.`,
      module: "inventory",
      link: { entity: "products", id: updated.id },
    });
    return updated;
  }
  return notifyRecoveredAlerts(fresh);
}
