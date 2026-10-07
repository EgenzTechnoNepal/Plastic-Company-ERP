import { MASTER_DATA_API, type MasterDataRow } from "@/services/api/masterData";
import type { MasterDataPageConfig, OptionSource } from "./MasterDataPage";

const itemOptions: OptionSource = {
  path: MASTER_DATA_API.items,
  label: (row) => `${String(row.sku ?? "")} - ${String(row.name ?? "")}`,
};

const supplierOptions: OptionSource = {
  path: MASTER_DATA_API.suppliers,
  label: (row) => String(row.trading_name || row.legal_name || row.code || row.id),
};

const uomOptions: OptionSource = {
  path: MASTER_DATA_API.uoms,
  label: (row) => String(row.code || row.name || row.id),
};

const currencyOptions: OptionSource = {
  path: MASTER_DATA_API.currencies,
  label: (row) => String(row.code || row.name || row.id),
};

const warehouseOptions: OptionSource = {
  path: MASTER_DATA_API.warehouses,
  label: (row) => `${String(row.code ?? "")} - ${String(row.name ?? "")}`,
};

const zoneOptions: OptionSource = {
  path: MASTER_DATA_API.zones,
  label: (row) => `${String(row.code ?? "")} - ${String(row.name ?? "")}`,
};

const rackOptions: OptionSource = {
  path: MASTER_DATA_API.racks,
  label: (row) => `${String(row.code ?? "")} - ${String(row.name ?? "")}`,
};

const yesNo = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const activeOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const priceBasis = [
  { value: "PER_UOM", label: "Per UOM" },
  { value: "PER_KG", label: "Per KG" },
  { value: "PER_WEIGHT", label: "Per weight" },
];

const binTypes = [
  "RECEIVING",
  "QC_HOLD",
  "QUARANTINE",
  "RAW_MATERIAL",
  "PRODUCTION",
  "FINISHED_GOODS",
  "REJECTED",
  "DISPATCH",
  "GENERAL",
].map((value) => ({ value, label: value.replace(/_/g, " ") }));

export const uomPageConfig: MasterDataPageConfig = {
  title: "UOM",
  description: "Units of measure from the inventory API.",
  path: MASTER_DATA_API.uoms,
  queryKey: "uoms",
  searchParam: "search",
  searchPlaceholder: "Search code, name or symbol...",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "symbol", label: "Symbol" },
    { key: "is_base_weight", label: "Base weight" },
    { key: "is_active", label: "Status" },
  ],
  fields: [
    { key: "code", label: "Code", required: true, readOnlyOnEdit: true },
    { key: "name", label: "Name", required: true },
    { key: "symbol", label: "Symbol" },
    { key: "is_base_weight", label: "Base weight", kind: "switch", defaultValue: false },
    { key: "is_active", label: "Active", kind: "switch", defaultValue: true },
  ],
  filters: [{ key: "active", label: "All status", param: "is_active", options: activeOptions }],
  getRowTitle: (row) => String(row.code || row.name || row.id),
};

export const supplierItemPricePageConfig: MasterDataPageConfig = {
  title: "Supplier Item Prices",
  description: "Supplier price records tied to real items, suppliers, UOM and currency.",
  path: MASTER_DATA_API.supplierItemPrices,
  queryKey: "supplier-item-prices",
  searchParam: "search",
  columns: [
    { key: "item", label: "Item" },
    { key: "supplier", label: "Supplier" },
    { key: "supplier_item_code", label: "Supplier code" },
    { key: "unit_price", label: "Unit price", align: "right" },
    { key: "price_basis", label: "Basis" },
    { key: "effective_from", label: "From" },
    { key: "is_active", label: "Status" },
  ],
  fields: [
    { key: "item", label: "Item", required: true, kind: "select", source: itemOptions },
    { key: "supplier", label: "Supplier", required: true, kind: "select", source: supplierOptions },
    { key: "uom", label: "UOM", required: true, kind: "select", source: uomOptions },
    { key: "currency", label: "Currency", required: true, kind: "select", source: currencyOptions },
    { key: "unit_price", label: "Unit price", required: true, kind: "number" },
    {
      key: "price_basis",
      label: "Price basis",
      kind: "select",
      options: priceBasis,
      defaultValue: "PER_UOM",
    },
    { key: "supplier_item_code", label: "Supplier item code" },
    { key: "minimum_order_quantity", label: "Minimum order quantity", kind: "number" },
    { key: "effective_from", label: "Effective from", kind: "date" },
    { key: "effective_to", label: "Effective to", kind: "date" },
    { key: "is_active", label: "Active", kind: "switch", defaultValue: true },
  ],
  filters: [
    { key: "item", label: "All items", param: "item", source: itemOptions },
    { key: "supplier", label: "All suppliers", param: "supplier", source: supplierOptions },
    { key: "active", label: "All status", param: "is_active", options: activeOptions },
  ],
  getRowTitle: (row) =>
    `${String(row.supplier_item_code || row.id)} @ ${String(row.unit_price ?? "")}`,
};

export const zonesPageConfig: MasterDataPageConfig = {
  title: "Zones",
  description: "Warehouse zones from the warehouse API.",
  path: MASTER_DATA_API.zones,
  queryKey: "zones",
  searchParam: "search",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "warehouse", label: "Warehouse" },
    { key: "is_active", label: "Status" },
  ],
  fields: [
    {
      key: "warehouse",
      label: "Warehouse",
      required: true,
      kind: "select",
      source: warehouseOptions,
    },
    { key: "code", label: "Code", required: true, readOnlyOnEdit: true },
    { key: "name", label: "Name", required: true },
    { key: "is_active", label: "Active", kind: "switch", defaultValue: true },
  ],
  filters: [
    { key: "warehouse", label: "All warehouses", param: "warehouse", source: warehouseOptions },
    { key: "active", label: "All status", param: "is_active", options: activeOptions },
  ],
  getRowTitle: (row) => String(row.code || row.name || row.id),
};

export const racksPageConfig: MasterDataPageConfig = {
  title: "Racks",
  description: "Rack masters from the warehouse API.",
  path: MASTER_DATA_API.racks,
  queryKey: "racks",
  searchParam: "search",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "zone", label: "Zone" },
    { key: "is_active", label: "Status" },
  ],
  fields: [
    { key: "zone", label: "Zone", required: true, kind: "select", source: zoneOptions },
    { key: "code", label: "Code", required: true, readOnlyOnEdit: true },
    { key: "name", label: "Name" },
    { key: "is_active", label: "Active", kind: "switch", defaultValue: true },
  ],
  filters: [
    { key: "zone", label: "All zones", param: "zone", source: zoneOptions },
    { key: "active", label: "All status", param: "is_active", options: activeOptions },
  ],
  getRowTitle: (row) => String(row.code || row.name || row.id),
};

export const binsPageConfig: MasterDataPageConfig = {
  title: "Bins",
  description: "Storage bins loaded from warehouse storage-bin endpoints.",
  path: MASTER_DATA_API.bins,
  queryKey: "storage-bins",
  searchParam: "search",
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "warehouse", label: "Warehouse" },
    { key: "zone", label: "Zone" },
    { key: "rack", label: "Rack" },
    {
      key: "bin_type",
      label: "Type",
      render: (row: MasterDataRow) => String(row.bin_type ?? "").replace(/_/g, " "),
    },
    { key: "is_active", label: "Status" },
  ],
  fields: [
    {
      key: "warehouse",
      label: "Warehouse",
      required: true,
      kind: "select",
      source: warehouseOptions,
    },
    { key: "zone", label: "Zone", kind: "select", source: zoneOptions },
    { key: "rack", label: "Rack", kind: "select", source: rackOptions },
    { key: "code", label: "Code", required: true, readOnlyOnEdit: true },
    { key: "name", label: "Name" },
    {
      key: "bin_type",
      label: "Bin type",
      kind: "select",
      options: binTypes,
      defaultValue: "GENERAL",
    },
    { key: "is_active", label: "Active", kind: "switch", defaultValue: true },
  ],
  filters: [
    { key: "warehouse", label: "All warehouses", param: "warehouse", source: warehouseOptions },
    { key: "zone", label: "All zones", param: "zone", source: zoneOptions },
    { key: "rack", label: "All racks", param: "rack", source: rackOptions },
    { key: "bin_type", label: "All bin types", param: "bin_type", options: binTypes },
    { key: "active", label: "All status", param: "is_active", options: activeOptions },
  ],
  getRowTitle: (row) => String(row.code || row.name || row.id),
};
