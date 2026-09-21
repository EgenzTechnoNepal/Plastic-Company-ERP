import { MasterImportPanel } from "@/components/common/MasterImportPanel";
import { EntityListPage } from "@/components/common/EntityListPage";
import {
  importProductPlanningRows,
  importWarehousePlanningRows,
  PRODUCT_PLANNING_TEMPLATE,
  WAREHOUSE_PLANNING_TEMPLATE,
} from "@/features/inventory/planning";
import { num, str } from "@/lib/records";

export function PlanningMasterPage() {
  return (
    <div className="space-y-6">
      <MasterImportPanel
        title="Item planning import (all warehouses)"
        description="Bulk update MOQ, reorder level, reorder quantity, safety stock, max stock, lead time, and preferred supplier per product."
        templateHeaders={PRODUCT_PLANNING_TEMPLATE}
        templateFilename="item-planning-template.xls"
        sampleRows={[
          {
            "ITM Code": "ITM-001",
            "Product Name": "PLA resin",
            "Product Type": "Raw Material",
            "Base UOM": "KG",
            MOQ: 1000,
            "Reorder Level": 2000,
            "Reorder Quantity": 5000,
            "Safety Stock": 500,
            "Max Stock": 12000,
            "Lead Time Days": 7,
            "Standard Rate": 320,
            "Preferred Supplier": "SUP-001",
          },
        ]}
        onImport={async (rows) => {
          const r = await importProductPlanningRows(rows);
          return { message: `Products: ${r.updated} updated, ${r.created} created` };
        }}
      />

      <MasterImportPanel
        title="Per-warehouse planning import"
        description="Same item can have different MOQ/reorder per warehouse (proposal §6.22 — item + warehouse parameters)."
        templateHeaders={WAREHOUSE_PLANNING_TEMPLATE}
        templateFilename="warehouse-item-planning-template.xls"
        sampleRows={[
          {
            "ITM Code": "ITM-001",
            Warehouse: "WH-RM",
            MOQ: 1000,
            "Reorder Level": 2500,
            "Reorder Quantity": 5000,
            "Safety Stock": 800,
            "Max Stock": 10000,
            "Lead Time Days": 7,
            "Preferred Supplier": "SUP-001",
          },
        ]}
        onImport={async (rows) => {
          const r = await importWarehousePlanningRows(rows);
          return { message: `${r.upserted} warehouse plan rows saved` };
        }}
      />

      <EntityListPage
        entity="warehouse_item_plans"
        kpis={(rows) => [
          { label: "Item × warehouse plans", value: rows.length },
          { label: "With supplier", value: rows.filter((r) => str(r, "preferredSupplier")).length },
          { label: "Avg MOQ", value: rows.length ? Math.round(rows.reduce((s, r) => s + num(r, "moq"), 0) / rows.length) : "—" },
          { label: "Avg lead time", value: rows.length ? `${Math.round(rows.reduce((s, r) => s + num(r, "leadTimeDays"), 0) / rows.length)}d` : "—" },
        ]}
      />
    </div>
  );
}
