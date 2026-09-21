import type { DocStatus, ErpRecord, LineItem } from "@/types/erp";

type CatalogItem = { code: string; name: string; uom: string; rate: number };

type SeedCtx = {
  push: (e: string, r: ErpRecord) => void;
  rec: (
    entity: string,
    code: string,
    title: string,
    date: string,
    status: DocStatus,
    fields?: Record<string, unknown>,
    lines?: LineItem[],
    links?: ErpRecord["links"],
  ) => ErpRecord;
  makeLine: (p: Partial<LineItem>) => LineItem;
  FG: CatalogItem[];
  RM: CatalogItem[];
};

/** Extra demo records — at least 5–8 per tab across Inventory, Warehouse, Production, QC, Commerce, HR. */
export function applyBulkSeed({ push, rec, makeLine, FG, RM }: SeedCtx) {
  /* ========== INVENTORY ========== */
  const allProducts = [...RM, ...FG];
  allProducts.forEach((p, i) => {
    const wh = i < RM.length ? "WH-RM" : "WH-FG";
    push(
      "warehouse_item_plans",
      rec("warehouse_item_plans", `WHP-${p.code}-${wh}`, `${p.code} @ ${wh}`, "2026-01-05", "active", {
        product: p.code,
        warehouse: wh,
        moq: [500, 1000, 2000, 400, 10000, 15000, 8000, 500, 1000][i] ?? 1000,
        reorderLevel: [1500, 1200, 2500, 350, 18000, 12000, 6000, 400, 800][i] ?? 500,
        reorderQuantity: [3000, 2500, 5000, 800, 50000, 40000, 20000, 1500, 2000][i] ?? 2000,
        safetyStock: [400, 500, 600, 200, 5000, 4000, 2000, 300, 400][i] ?? 300,
        maxStock: [6000, 5000, 10000, 1500, 90000, 70000, 40000, 2500, 3000][i] ?? 5000,
        leadTimeDays: i < RM.length ? 7 + (i % 3) * 3 : 3 + (i % 2),
        preferredSupplier: i < RM.length ? `SUP-00${(i % 3) + 1}` : "",
      }),
    );
  });

  const extraMovements: Array<[string, string, string, number, string, string]> = [
    ["2026-08-01", "Receipt", "RM-PBAT-002", 1500, "PO-004", "WH-RM"],
    ["2026-08-05", "Issue", "RM-STA-003", -400, "MI-002", "WH-RM"],
    ["2026-08-08", "Production Receipt", "FG-GRB-010", 12000, "WO-002", "WH-FG"],
    ["2026-08-10", "Transfer In", "FG-CORN-002", 5000, "TR-003", "WH-FG"],
    ["2026-08-12", "Adjustment", "FG-CORN-001", -120, "ADJ-003", "WH-FG"],
    ["2026-08-15", "Dispatch", "FG-CORN-002", -3000, "DN-003", "WH-FG"],
    ["2026-08-18", "Receipt", "RM-MB-004", 400, "GRN-004", "WH-RM"],
    ["2026-08-20", "Issue", "RM-PLA-001", -600, "MI-003", "WH-RM"],
  ];
  extraMovements.forEach(([d, type, item, qty, ref, wh], i) =>
    push(
      "stock_movements",
      rec("stock_movements", `SM-${200 + i}`, `${type} — ${item}`, d, "completed", {
        type,
        product: item,
        qty,
        reference: ref,
        warehouse: wh,
        by: "Hari Karki",
      })),
  );

  [
    ["ADJ-002", "Shrinkage — FG garbage bags", "WH-FG", "Shrinkage", -1560],
    ["ADJ-003", "Count variance — corn bags", "WH-FG", "Count variance", -1680],
    ["ADJ-004", "Moisture loss — PLA resin", "WH-RM", "Moisture loss", -2240],
    ["ADJ-005", "Found stock — starch", "WH-RM", "Found stock", 870],
    ["ADJ-006", "Damaged wrap film write-off", "WH-FG", "Damage", -19200],
    ["ADJ-007", "Reclassification — masterbatch", "WH-RM", "Reclassification", 0],
  ].forEach(([code, title, wh, reason, val], i) =>
    push(
      "stock_adjustments",
      rec("stock_adjustments", code as string, title as string, `2026-08-${10 + i}`, i % 2 ? "approved" : "pending_approval", {
        warehouse: wh,
        reason,
        varianceValue: val,
        countRef: i < 3 ? `CNT-00${i + 1}` : "",
      }, [
        makeLine({
          item: i % 2 === 0 ? FG[i % FG.length].code : RM[i % RM.length].code,
          description: i % 2 === 0 ? FG[i % FG.length].name : RM[i % RM.length].name,
          qty: (Number(val) / 20) || -10,
          rate: i % 2 === 0 ? FG[i % FG.length].rate : RM[i % RM.length].rate,
          warehouse: wh,
        }),
      ])),
  );

  /* ========== WAREHOUSE ========== */
  push("warehouses", rec("warehouses", "WH-TR", "Transit Hub — Kathmandu", "2026-02-01", "active", {
    location: "Kathmandu", keeper: "Nabin Limbu", zones: 2, utilization: 41,
  }));
  ["B-02-01", "B-02-02", "R-03-01", "Q-02-01"].forEach((b, i) =>
    push(
      "bins",
      rec("bins", b, `Bin ${b}`, "2026-02-01", "active", {
        warehouse: i < 2 ? "WH-FG" : i === 2 ? "WH-RM" : "WH-QR",
        zone: b.split("-")[0],
        rack: b.split("-")[1],
        capacity: 4000,
        occupied: [1800, 2200, 1600, 900][i],
        product: [FG[1].code, FG[3].code, RM[1].code, RM[3].code][i],
      })),
  );

  const grnBulk: Array<[string, string, string, string, string, string, number, number, string]> = [
    ["GRN-003", "GRN — Corn Starch 8,000 KG", "PO-002", "SUP-002", "WH-RM", "completed", 7950, 50, "Completed"],
    ["GRN-004", "GRN — Green Masterbatch 400 KG", "PO-003", "SUP-003", "WH-RM", "completed", 380, 20, "Completed"],
    ["GRN-005", "GRN — PBAT 2,000 KG", "PO-004", "SUP-001", "WH-RM", "in_progress", 0, 0, "Pending"],
    ["GRN-006", "GRN — PLA top-up 3,000 KG", "PO-005", "SUP-001", "WH-RM", "completed", 2980, 20, "In Progress"],
    ["GRN-007", "GRN — Wrap film rolls", "PO-006", "SUP-004", "WH-FG", "completed", 480, 0, "Pending"],
    ["GRN-008", "GRN — Starch mills return lot", "PO-002", "SUP-002", "WH-RM", "draft", 0, 0, "Pending"],
  ];
  grnBulk.forEach(([code, title, po, sup, wh, status, acc, rej, putaway], i) => {
    const item = i < 4 ? RM[i % RM.length] : i === 4 ? FG[3] : RM[2];
    push(
      "grns",
      rec("grns", code, title, `2026-08-${12 + i}`, status as DocStatus, {
        purchaseOrder: po,
        supplierName: ["Kathmandu Starch Mills", "Asia Masterbatch Co.", "Nepal Polymer Imports", "Nepal Polymer Imports", "GreenPack Supplies", "Kathmandu Starch Mills"][i],
        gateEntry: `GE-00${3 + i}`,
        warehouse: wh,
        inspection: acc > 0 ? "Passed" : "Pending",
        batch: `RM-BATCH-08${20 + i}`,
        acceptedQty: acc,
        rejectedQty: rej,
        putawayStatus: putaway,
      }, [makeLine({ item: item.code, description: item.name, uom: item.uom, qty: acc + rej || 1000, rate: item.rate, warehouse: wh })]));
  });

  [
    ["DN-002", "Delivery — Ministry of Environment", "SO-002", "CUST-004", "completed"],
    ["DN-003", "Delivery — GreenPack Nepal", "SO-003", "CUST-003", "completed"],
    ["DN-004", "Delivery — BioWrap Distributors", "SO-004", "CUST-005", "in_progress"],
    ["DN-005", "Delivery — GreenPack packed lot", "SO-005", "CUST-003", "approved"],
    ["DN-006", "Delivery — Himalayan pick queue", "SO-006", "CUST-001", "draft"],
    ["DN-007", "Delivery — Everest Retail partial", "SO-007", "CUST-002", "approved"],
  ].forEach(([code, title, so, cust, status], i) =>
    push(
      "deliveries",
      rec("deliveries", code as string, title as string, `2026-08-${15 + i}`, status as DocStatus, {
        salesOrder: so,
        customerName: ["Ministry of Environment", "GreenPack Nepal", "BioWrap Distributors Pvt. Ltd.", "GreenPack Nepal", "Himalayan Organic Foods", "Everest Retail Chain"][i],
        vehicle: `BA ${i + 3} KHA ${4400 + i}`,
        driver: ["Ram Bahadur", "Suresh Yadav", "Binod Magar", "Hari Thapa", "Kamal Rai", "Dipesh Gurung"][i],
        gatePass: `GP-01${i + 2}`,
        destination: ["Singha Durbar", "Bhaktapur", "Pokhara", "Bhaktapur", "Balaju", "Lalitpur"][i],
      }, [makeLine({ item: FG[i % FG.length].code, description: FG[i % FG.length].name, qty: 1000 * (i + 1), rate: FG[i % FG.length].rate, warehouse: "WH-FG" })])),
  );

  [
    ["TR-003", "WH-RM → WH-FG transfer", "WH-RM", "WH-FG", "completed"],
    ["TR-004", "WH-FG → WH-TR transit", "WH-FG", "WH-TR", "in_progress"],
    ["TR-005", "WH-TR → WH-FG receipt", "WH-TR", "WH-FG", "approved"],
    ["TR-006", "WH-FG → WH-CS consignment", "WH-FG", "WH-CS", "in_progress"],
    ["TR-007", "WH-RM quarantine move", "WH-RM", "WH-QR", "draft"],
    ["TR-008", "WH-FG sample transfer", "WH-FG", "WH-RM", "approved"],
  ].forEach(([code, title, src, dest, status], i) =>
    push(
      "stock_transfers",
      rec("stock_transfers", code as string, title as string, `2026-08-${10 + i}`, status as DocStatus, {
        source: src,
        destination: dest,
        destWarehouse: dest,
        vehicle: `GA 2 KHA ${3300 + i}`,
        stage: ["Completed", "In Transit", "Requested", "In Transit", "Requested", "Requested"][i],
        requestedBy: "Hari Karki",
      }, [makeLine({ item: i % 2 === 0 ? FG[i % FG.length].code : RM[i % RM.length].code, qty: 500 + i * 200, rate: 20 })])),
  );

  [
    ["BT-003", "R-02-01 → R-03-01", "WH-RM", "R-02-01", "R-03-01", "RM-PLA-001", 800],
    ["BT-004", "B-02-01 → B-02-02", "WH-FG", "B-02-01", "B-02-02", "FG-CORN-002", 600],
    ["BT-005", "A-01-01 → A-01-02", "WH-FG", "A-01-01", "A-01-02", "FG-GRB-010", 1500],
    ["BT-006", "Q-01-01 → Q-02-01", "WH-QR", "Q-01-01", "Q-02-01", "FG-CORN-001", 200],
    ["BT-007", "R-03-01 → R-02-01", "WH-RM", "R-03-01", "R-02-01", "RM-PBAT-002", 400],
    ["BT-008", "B-02-02 → A-01-02", "WH-FG", "B-02-02", "A-01-02", "FG-FILM-004", 80],
  ].forEach(([code, title, wh, src, dest, prod, qty], i) =>
    push(
      "bin_transfers",
      rec("bin_transfers", code as string, title as string, `2026-08-${12 + i}`, i % 3 === 0 ? "completed" : "in_progress", {
        warehouse: wh,
        sourceBin: src,
        destinationBin: dest,
        product: prod,
        qty,
        by: "Hari Karki",
      })),
  );

  [
    ["CNT-003", "Cycle count — Zone B", "WH-FG", "B"],
    ["CNT-004", "Cycle count — Zone Q", "WH-QR", "Q"],
    ["CNT-005", "Full count — RM store", "WH-RM", "R"],
    ["CNT-006", "Spot check — FG film", "WH-FG", "A"],
    ["CNT-007", "Consignment count — Pokhara", "WH-CS", "C"],
    ["CNT-008", "Transit hub verification", "WH-TR", "T"],
  ].forEach(([code, title, wh, zone], i) =>
    push(
      "stock_counts",
      rec("stock_counts", code as string, title as string, `2026-08-${14 + i}`, i % 2 ? "completed" : "in_progress", {
        warehouse: wh,
        zone,
        countedBy: "Hari Karki",
        itemsCounted: 8 + i,
        variances: i % 3,
        varianceValue: -1200 * (i + 1),
        approval: i % 2 ? "Approved" : "Pending",
      })),
  );

  [
    ["QRN-002", "Hold — Incoming masterbatch", "RM-MB-004", "RM-BATCH-0822", 80],
    ["QRN-003", "Hold — Wrap film near expiry", "FG-FILM-004", "BATCH-EXP", 40],
    ["QRN-004", "Hold — PBAT moisture fail", "RM-PBAT-002", "RM-BATCH-0818", 200],
    ["QRN-005", "Hold — Customer return lot", "FG-CORN-001", "BATCH-001", 500],
    ["QRN-006", "Hold — Seal strength fail", "FG-CORN-001", "BATCH-002", 300],
    ["QRN-007", "Hold — Starch foreign matter", "RM-STA-003", "RM-BATCH-0815", 150],
  ].forEach(([code, title, prod, batch, qty], i) =>
    push(
      "quarantine",
      rec("quarantine", code as string, title as string, `2026-08-${10 + i}`, "hold", {
        product: prod,
        batch,
        qty,
        source: ["Incoming QC", "Expiry review", "Incoming QC", "Sales Return", "Final QC", "Incoming QC"][i],
        reason: ["Colour drift", "Near expiry", "Moisture high", "Print defect", "Seal fail", "Foreign matter"][i],
        warehouse: "WH-QR",
      })),
  );

  /* ========== PRODUCTION ========== */
  [
    ["PP-003", "September 2026 Master Plan", "2026-09", "Make to Stock"],
    ["PP-004", "September 2026 MTO overlay", "2026-09", "Make to Order"],
    ["PP-005", "October 2026 Master Plan", "2026-10", "Make to Stock"],
    ["PP-006", "Festival season surge plan", "2026-09", "Make to Stock"],
    ["PP-007", "Export trial batch plan", "2026-10", "Make to Order"],
    ["PP-008", "Maintenance week replan", "2026-09", "Make to Stock"],
  ].forEach(([code, title, period, strategy], i) =>
    push(
      "production_plans",
      rec("production_plans", code as string, title as string, `2026-08-${5 + i}`, i === 0 ? "approved" : "draft", {
        period,
        version: `v${i + 1}`,
        planner: "Bikash Thapa",
        strategy,
        totalPlannedQty: 120000 + i * 15000,
      }, [
        makeLine({ item: FG[i % FG.length].code, description: FG[i % FG.length].name, qty: 50000 + i * 5000, rate: FG[i % FG.length].rate }),
        makeLine({ item: FG[(i + 1) % FG.length].code, description: FG[(i + 1) % FG.length].name, qty: 40000, rate: FG[(i + 1) % FG.length].rate }),
      ])),
  );

  [
    ["MRP-002", "MRP Run — September 2026", "PP-003", "2026-09"],
    ["MRP-003", "MRP Run — Festival surge", "PP-006", "2026-09"],
    ["MRP-004", "MRP Run — October 2026", "PP-005", "2026-10"],
    ["MRP-005", "MRP Run — Export trial", "PP-007", "2026-10"],
    ["MRP-006", "MRP Run — Maintenance week", "PP-008", "2026-09"],
    ["MRP-007", "MRP Run — Replan v2", "PP-004", "2026-09"],
  ].forEach(([code, title, plan, period], i) =>
    push(
      "mrp_runs",
      rec("mrp_runs", code as string, title as string, `2026-08-${8 + i}`, i % 2 ? "completed" : "in_progress", {
        plan,
        period,
        warehouse: "WH-RM",
        lotSizing: "Lot-for-Lot",
        suggestions: 3 + i,
        converted: i % 3,
      })),
  );

  [
    ["WO-004", "Cornstarch bag 16x20 — 15,000 PCS", "FG-CORN-002", "BOM-003", 15000, "released"],
    ["WO-005", "Wrap film 300mm — 2,000 ROLL", "FG-FILM-004", "BOM-004", 2000, "in_progress"],
    ["WO-006", "Garbage bag 24x32 — 20,000 PCS", "FG-GRB-010", "BOM-002", 20000, "released"],
    ["WO-007", "Cornstarch bag 12x16 — 8,000 PCS", "FG-CORN-001", "BOM-001", 8000, "draft"],
    ["WO-008", "Trial export batch — 5,000 PCS", "FG-CORN-001", "BOM-001", 5000, "draft"],
  ].forEach(([code, title, prod, bom, qty, status], i) =>
    push(
      "work_orders",
      rec("work_orders", code as string, title as string, `2026-08-${10 + i}`, status as DocStatus, {
        product: prod,
        bom,
        plannedQty: qty,
        producedQty: status === "in_progress" ? Math.round(Number(qty) * 0.4) : 0,
        scrapQty: i * 20,
        machine: ["EXT-01", "EXT-02", "EXT-02", "EXT-01", "PRN-01"][i],
        supervisor: "Bikash Thapa",
        plan: "PP-003",
        startDate: `2026-08-${12 + i}`,
        endDate: `2026-08-${14 + i}`,
        standardCost: 180000 + i * 25000,
        actualCost: status === "in_progress" ? 95000 + i * 10000 : 0,
        materialCost: 85000,
        labourCost: 12000,
        variance: i * 5000,
      })),
  );

  push("boms", rec("boms", "BOM-003", "Cornstarch Carry Bag 16x20 — v1", "2026-06-15", "approved", {
    product: "FG-CORN-002", version: "v1", effectiveFrom: "2026-06-15", outputQty: 1000, unitCost: 10.2, approvedBy: "Bikash Thapa",
  }, [
    makeLine({ item: RM[0].code, description: RM[0].name, uom: "KG", qty: 6.5, rate: 320 }),
    makeLine({ item: RM[2].code, description: RM[2].name, uom: "KG", qty: 2.2, rate: 145 }),
    makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 0.45, rate: 620 }),
  ]));
  push("boms", rec("boms", "BOM-004", "Biodegradable Wrap Film 300mm — v1", "2026-06-20", "approved", {
    product: "FG-FILM-004", version: "v1", effectiveFrom: "2026-06-20", outputQty: 100, unitCost: 420, approvedBy: "Bikash Thapa",
  }, [
    makeLine({ item: RM[1].code, description: RM[1].name, uom: "KG", qty: 45, rate: 410 }),
    makeLine({ item: RM[3].code, description: RM[3].name, uom: "KG", qty: 2, rate: 620 }),
  ]));

  [
    ["MI-002", "Material Issue — WO-002", "WO-002", 2400],
    ["MI-003", "Material Issue — WO-004", "WO-004", 1200],
    ["MI-004", "Material Issue — WO-005", "WO-005", 900],
    ["MI-005", "Material Issue — WO-006", "WO-006", 1800],
    ["MI-006", "Backflush — WO-001 scrap", "WO-001", 80],
    ["MI-007", "Material Issue — WO-007 draft", "WO-007", 0],
  ].forEach(([code, title, wo, qty], i) =>
    push(
      "material_issues",
      rec("material_issues", code as string, title as string, `2026-08-${11 + i}`, qty > 0 ? "completed" : "draft", {
        workOrder: wo,
        warehouse: "WH-RM",
        issuedBy: "Hari Karki",
        mode: i % 2 ? "Backflush" : "Manual",
      }, qty > 0 ? [makeLine({ item: RM[i % RM.length].code, description: RM[i % RM.length].name, uom: "KG", qty, rate: RM[i % RM.length].rate })] : []),
    ),
  );

  [
    ["OP-003", "Printing — WO-004", "WO-004", "PRN-01"],
    ["OP-004", "Extrusion — WO-005", "WO-005", "EXT-02"],
    ["OP-005", "Sealing — WO-006", "WO-006", "SEL-01"],
    ["OP-006", "Extrusion — WO-007", "WO-007", "EXT-01"],
    ["OP-007", "Printing — WO-008", "WO-008", "PRN-01"],
    ["OP-008", "Sealing — WO-002", "WO-002", "SEL-01"],
  ].forEach(([code, title, wo, machine], i) =>
    push(
      "operations",
      rec("operations", code as string, title as string, `2026-08-${13 + i}`, i < 2 ? "in_progress" : "draft", {
        workOrder: wo,
        workCentre: machine.startsWith("EXT") ? "Extrusion" : machine.startsWith("PRN") ? "Printing" : "Sealing",
        machine,
        operator: "Kiran Magar",
        plannedHrs: 12 + i,
        actualHrs: i < 2 ? 6 + i : 0,
        outputQty: i < 2 ? 4000 + i * 500 : 0,
        scrap: i * 15,
        rework: i * 5,
        downtimeMins: i * 20,
      })),
  );

  [
    ["BATCH-002", "FG Batch — Corn bag 16x20", "FG-CORN-002", "WO-004"],
    ["BATCH-003", "FG Batch — Garbage bags", "FG-GRB-010", "WO-006"],
    ["BATCH-004", "FG Batch — Wrap film rolls", "FG-FILM-004", "WO-005"],
    ["BATCH-005", "RM Batch — PBAT lot", "RM-PBAT-002", ""],
    ["BATCH-006", "FG Batch — Export trial", "FG-CORN-001", "WO-008"],
  ].forEach(([code, title, prod, wo], i) =>
    push(
      "batches",
      rec("batches", code as string, title as string, `2026-08-${10 + i}`, i === 4 ? "hold" : "released", {
        product: prod,
        workOrder: wo || undefined,
        qty: [15000, 18000, 800, 2000, 5000][i],
        mfgDate: `2026-08-${10 + i}`,
        expiry: `2028-08-${10 + i}`,
        qcStatus: i === 4 ? "Pending" : "Passed",
        location: i < 3 ? "WH-FG / A-01-02" : "WH-RM / R-03-01",
      })),
  );

  [
    ["MS-002", "Week 33 machine schedule", "2026-W33"],
    ["MS-003", "Week 34 machine schedule", "2026-W34"],
    ["MS-004", "Festival surge schedule", "2026-W35"],
    ["MS-005", "Maintenance window schedule", "2026-W32"],
    ["MS-006", "Export trial schedule", "2026-W36"],
  ].forEach(([code, title, week], i) =>
    push(
      "machine_schedules",
      rec("machine_schedules", code as string, title as string, `2026-08-${1 + i}`, i === 0 ? "released" : "draft", {
        week,
        planner: "Bikash Thapa",
        slots: [
          { machine: "EXT-01", workOrder: `WO-00${4 + (i % 3)}`, start: "2026-08-01T06:00", end: "2026-08-01T14:00", setupMins: 30 },
          { machine: "EXT-02", workOrder: "WO-006", start: "2026-08-01T14:00", end: "2026-08-01T22:00", setupMins: 25 },
        ],
      })),
  );

  [["PKG-01", "Bagging Line 1"], ["CUT-01", "Film Slitter"], ["LBL-01", "Label Applicator"]].forEach(([c, nm]) =>
    push("machines", rec("machines", c, nm, "2026-03-01", "active", {
      workCentre: c.startsWith("PKG") ? "Packaging" : c.startsWith("CUT") ? "Slitting" : "Labelling",
      capacityPerHr: 1800,
      shift: "B",
      status: "Idle",
      utilization: 45,
      lastMaintenance: "2026-06-15",
    })),
  );

  /* ========== QUALITY CONTROL ========== */
  [
    ["QP-004", "Incoming PBAT plan", "RM-PBAT-002", "Incoming"],
    ["QP-005", "In-process garbage bag plan", "FG-GRB-010", "In-Process"],
    ["QP-006", "Incoming starch plan", "RM-STA-003", "Incoming"],
    ["QP-007", "Final corn bag 16x20 plan", "FG-CORN-002", "Final"],
    ["QP-008", "Incoming masterbatch plan", "RM-MB-004", "Incoming"],
  ].forEach(([code, title, prod, stage], i) =>
    push(
      "quality_plans",
      rec("quality_plans", code as string, title as string, `2026-04-${1 + i}`, "active", {
        product: prod,
        stage,
        sampleSize: "AQL 2.5",
        parameters: "Visual, dimensional, functional",
      })),
  );

  const qcStages: Array<["Incoming" | "In-Process" | "Final", string, string, string]> = [
    ["Incoming", "GRN-003", "RM-STA-003", "RM-BATCH-0815"],
    ["Incoming", "GRN-004", "RM-MB-004", "RM-BATCH-0822"],
    ["Incoming", "GRN-005", "RM-PBAT-002", "RM-BATCH-0818"],
    ["Incoming", "GRN-006", "RM-PLA-001", "RM-BATCH-0825"],
    ["Incoming", "GRN-007", "FG-FILM-004", "BATCH-004"],
    ["In-Process", "WO-004", "FG-CORN-002", "BATCH-002"],
    ["In-Process", "WO-005", "FG-FILM-004", "BATCH-004"],
    ["In-Process", "WO-006", "FG-GRB-010", "BATCH-003"],
    ["Final", "WO-004", "FG-CORN-002", "BATCH-002"],
    ["Final", "WO-006", "FG-GRB-010", "BATCH-003"],
  ];
  qcStages.forEach(([stage, ref, prod, batch], i) =>
    push(
      "qc_inspections",
      rec("qc_inspections", `QC-${10 + i}`, `${stage} — ${prod}`, `2026-08-${10 + i}`, i % 4 === 0 ? "draft" : "approved", {
        stage,
        reference: ref,
        product: prod,
        batch,
        sampleSize: 16 + i,
        defects: i % 5,
        result: i % 4 === 0 ? "Pending" : "Pass",
        inspector: "QC Lead",
        disposition: i % 4 === 0 ? "Hold" : "Release",
      })),
  );

  [
    ["INS-003", "Digital caliper DC-50", "QC Lab"],
    ["INS-004", "Melt flow indexer MFI-8", "Incoming lab"],
    ["INS-005", "Colour spectrophotometer CS-200", "QC Lab"],
    ["INS-006", "Seal strength tester ST-15", "Production QC"],
    ["INS-007", "Disintegration bath DB-90", "QC Lab"],
    ["INS-008", "Weighing balance WB-0.01", "Incoming lab"],
  ].forEach(([code, name, loc], i) =>
    push(
      "instruments",
      rec("instruments", code as string, name as string, `2026-02-${10 + i}`, "active", {
        location: loc,
        lastCalibration: `2026-0${4 + (i % 3)}-01`,
        nextCalibration: `2026-${10 + (i % 2)}-01`,
        status: i === 1 ? "Overdue" : "Calibrated",
      })),
  );

  [
    ["COA-001", "CoA — PLA Resin GRN-001", "QC-001"],
    ["COA-002", "CoA — Corn starch GRN-003", "QC-010"],
    ["COA-003", "CoA — FG Batch BATCH-001", "QC-002"],
    ["COA-004", "CoA — Garbage bags BATCH-003", "QC-019"],
    ["COA-005", "CoA — Wrap film BATCH-004", "QC-014"],
    ["COA-006", "CoA — PBAT incoming", "QC-012"],
  ].forEach(([code, title, insp], i) =>
    push(
      "certificates",
      rec("certificates", code as string, title as string, `2026-08-${12 + i}`, i === 5 ? "draft" : "approved", {
        name: title,
        inspection: insp,
        product: [RM[0].code, RM[2].code, FG[0].code, FG[2].code, FG[3].code, RM[1].code][i],
        batch: `BATCH-00${i + 1}`,
        issuedBy: "QC Lead",
        standard: "ISO 17088",
      })),
  );

  [
    ["NCR-003", "Starch moisture above limit", "Major", "RM-STA-003"],
    ["NCR-004", "Film tensile below spec", "Minor", "FG-FILM-004"],
    ["NCR-005", "PBAT colour variation", "Major", "RM-PBAT-002"],
    ["NCR-006", "Bag dimension out of tolerance", "Minor", "FG-CORN-002"],
    ["NCR-007", "Masterbatch ΔE drift", "Minor", "RM-MB-004"],
  ].forEach(([code, title, sev, prod], i) =>
    push(
      "ncrs",
      rec("ncrs", code as string, title as string, `2026-08-${14 + i}`, "open", {
        source: "Inspection",
        reference: `QC-${12 + i}`,
        severity: sev,
        product: prod,
        problem: title,
        raisedBy: "QC Lead",
        costImpact: 8000 + i * 4000,
      })),
  );

  [
    ["CAPA-002", "Moisture control for starch intake", "NCR-003", "Hari Karki"],
    ["CAPA-003", "Film extrusion temperature SOP", "NCR-004", "Bikash Thapa"],
    ["CAPA-004", "Supplier colour certificate requirement", "NCR-005", "QC Lead"],
    ["CAPA-005", "Die calibration schedule", "NCR-006", "Kiran Magar"],
    ["CAPA-006", "Masterbatch incoming visual standard", "NCR-007", "QC Lead"],
  ].forEach(([code, title, ncr, owner], i) =>
    push(
      "capas",
      rec("capas", code as string, title as string, `2026-08-${15 + i}`, i < 2 ? "in_progress" : "draft", {
        ncr,
        owner,
        dueDate: `2026-09-${5 + i}`,
        stage: ["Root Cause", "Corrective Action", "Preventive Action", "Verification", "Closed"][i],
        containment: "Quarantine affected lots",
        correctiveAction: "Update SOP and retrain operators",
        preventiveAction: "Add calibration checkpoint",
        effectiveness: "Pending",
      })),
  );

  /* ========== CRM ========== */
  [
    ["CON-004", "Prakash Koirala", "CUST-002", "Store Manager"],
    ["CON-005", "Maya Tamang", "CUST-003", "Owner"],
    ["CON-006", "Govinda Poudel", "CUST-004", "Procurement Officer"],
    ["CON-007", "Sangita Shrestha", "CUST-005", "Sales Contact"],
    ["CON-008", "Bikram Thapa", "CUST-001", "Finance Manager"],
  ].forEach(([c, nm, cu, role]) =>
    push("contacts", rec("contacts", c as string, nm as string, "2026-03-01", "active", {
      customer: cu, designation: role, phone: "+977-9842000000", email: "contact@ecowrap.com",
    })),
  );

  [
    ["OPP-002", "Everest Retail annual contract", "CUST-002", 3800000],
    ["OPP-003", "GreenPack private label launch", "CUST-003", 2200000],
    ["OPP-004", "Government tender — compostable bags", "CUST-004", 8500000],
    ["OPP-005", "Pokhara dealer expansion", "CUST-005", 1600000],
    ["OPP-006", "Himalayan Organic repeat order", "CUST-001", 2900000],
  ].forEach(([code, title, cust, val], i) =>
    push("opportunities", rec("opportunities", code as string, title as string, `2026-07-${10 + i}`, "open", {
      customer: cust, stage: ["qualification", "proposal", "negotiation", "won", "negotiation"][i],
      value: val, probability: [25, 40, 65, 90, 55][i], owner: "Sita Rai", expectedClose: `2026-09-${15 + i}`,
    })),
  );

  [
    ["ACT-003", "Site visit — GreenPack Nepal", "Visit", "CUST-003"],
    ["ACT-004", "Email — quotation follow-up", "Email", "CUST-002"],
    ["ACT-005", "Demo — compostable film", "Demo", "CUST-004"],
    ["ACT-006", "Call — payment reminder", "Call", "CUST-001"],
    ["ACT-007", "Meeting — dealer terms", "Meeting", "CUST-005"],
    ["ACT-008", "Trade fair lead nurture", "Call", "CUST-002"],
  ].forEach(([code, title, type, cust], i) =>
    push("activities", rec("activities", code as string, title as string, `2026-08-${5 + i}`, i % 2 ? "completed" : "open", {
      type, customer: cust, owner: "Sita Rai", outcome: i % 2 ? "Positive response" : "",
      nextAction: "Send proposal", nextDate: `2026-08-${20 + i}`, dueDate: `2026-08-${18 + i}`,
    })),
  );

  [
    ["DLR-003", "Chitwan Eco Traders", "Central Region", 4.5],
    ["DLR-004", "Dhangadhi Packaging House", "Far-Western Region", 5],
    ["DLR-005", "Butwal Green Supplies", "Western Region", 4],
    ["DLR-006", "Birgunj Poly Hub", "Central Region", 4.5],
    ["DLR-007", "Nepalgunj Agro Pack", "Mid-Western Region", 5],
  ].forEach(([c, nm, t, comm], i) =>
    push("dealers", rec("dealers", c as string, nm as string, "2026-04-01", "active", {
      territory: t, commissionPct: comm, ytdSales: 1200000 + i * 300000, commissionEarned: 60000 + i * 5000,
      target: 3000000 + i * 500000, achievement: 1100000 + i * 250000, consignmentStock: 50000 + i * 20000,
      contact: "+977-9857000000",
    })),
  );

  [
    ["TKT-003", "Late delivery complaint", "CUST-003", "high"],
    ["TKT-004", "Invoice mismatch", "CUST-002", "normal"],
    ["TKT-005", "Sample request — film", "CUST-004", "low"],
    ["TKT-006", "Bag size change request", "CUST-001", "normal"],
    ["TKT-007", "Credit note follow-up", "CUST-005", "normal"],
    ["TKT-008", "Quality certificate request", "CUST-004", "low"],
  ].forEach(([code, title, cust, pri], i) =>
    push("tickets", rec("tickets", code as string, title as string, `2026-08-${10 + i}`, i % 3 === 0 ? "completed" : "open", {
      name: title, customer: cust, priority: pri, slaHours: pri === "high" ? 24 : 48,
      openedAt: `2026-08-${10 + i}T08:00:00Z`, assignee: "Sita Rai", complaint: title,
    })),
  );

  [
    ["QT-003", "Ministry of Environment — Rev 01", "CUST-004", "approved"],
    ["QT-004", "GreenPack Nepal — Rev 03", "CUST-003", "pending_approval"],
    ["QT-005", "BioWrap Distributors — Rev 01", "CUST-005", "approved"],
    ["QT-006", "Everest Retail — garbage bags", "CUST-002", "draft"],
    ["QT-007", "Himalayan Organic — add-on order", "CUST-001", "approved"],
    ["QT-008", "Dealer trial — Pokhara", "CUST-005", "draft"],
  ].forEach(([code, title, cust, status], i) =>
    push("quotations", rec("quotations", code as string, title as string, `2026-08-${1 + i}`, status as DocStatus, {
      customer: cust, revision: `Rev 0${i + 1}`, validTill: `2026-09-${1 + i}`, paymentTerms: "30 Days Credit",
      currency: "NPR", salesperson: "Sita Rai",
    }, [makeLine({ item: FG[i % FG.length].code, description: FG[i % FG.length].name, qty: 5000 + i * 1000, rate: FG[i % FG.length].rate, warehouse: "WH-FG" })])),
  );

  /* ========== SALES ========== */
  push("sales_orders", rec("sales_orders", "SO-007", "Everest Retail Chain — partial", "2026-08-22", "in_progress", {
    customer: "CUST-002", customerName: "Everest Retail Chain", branch: "Head Office — Kathmandu",
    paymentTerms: "45 Days Credit", currency: "NPR", deliveryDate: "2026-08-29", salesperson: "Sita Rai",
    allocationStatus: "Allocated", pickStatus: "Picked", packStatus: "Packed", dispatchStatus: "Pending",
    invoiceStatus: "Not Invoiced", paymentStatus: "Unpaid",
  }, [makeLine({ item: FG[1].code, description: FG[1].name, qty: 8000, rate: 19, warehouse: "WH-FG" })]));

  [
    ["INV-003", "GreenPack Nepal", "CUST-003", "SO-003"],
    ["INV-004", "BioWrap Distributors", "CUST-005", "SO-004"],
    ["INV-005", "Ministry of Environment", "CUST-004", "SO-002"],
    ["INV-006", "Everest Retail Chain", "CUST-002", "SO-007"],
    ["INV-007", "Himalayan Organic Foods", "CUST-001", "SO-001"],
  ].forEach(([code, name, cust, so], i) =>
    push("invoices", rec("invoices", code as string, name as string, `2026-08-${16 + i}`, i < 3 ? "posted" : "pending_approval", {
      customer: cust, customerName: name, salesOrder: so, dueDate: `2026-09-${10 + i}`,
      paid: i * 50000, fiscalYear: "2082/83", irdStatus: "Transmitted",
    }, [makeLine({ item: FG[i % FG.length].code, description: FG[i % FG.length].name, qty: 3000 + i * 500, rate: FG[i % FG.length].rate })])),
  );

  [
    ["PAY-002", "Receipt — GreenPack Nepal", "CUST-003", 150000],
    ["PAY-003", "Receipt — Ministry partial", "CUST-004", 500000],
    ["PAY-004", "Receipt — BioWrap advance", "CUST-005", 80000],
    ["PAY-005", "Receipt — Everest Retail", "CUST-002", 120000],
    ["PAY-006", "Receipt — Himalayan balance", "CUST-001", 102650],
  ].forEach(([code, title, cust, amt], i) =>
    push("payments", rec("payments", code as string, title as string, `2026-08-${18 + i}`, "posted", {
      customer: cust, mode: i % 2 ? "Cheque" : "Bank Transfer", bank: "NIC Asia", reference: `TXN-${8800 + i}`, amount: amt,
    })),
  );

  [
    ["SR-002", "Return — GreenPack short count", "CUST-003", "INV-003"],
    ["SR-003", "Return — film damage in transit", "CUST-004", "INV-005"],
    ["SR-004", "Return — wrong bag size", "CUST-002", "INV-006"],
    ["SR-005", "Return — print smudge", "CUST-001", "INV-001"],
    ["SR-006", "Return — excess delivery", "CUST-005", "INV-004"],
  ].forEach(([code, title, cust, inv], i) =>
    push("sales_returns", rec("sales_returns", code as string, title as string, `2026-08-${20 + i}`, "submitted", {
      customer: cust, originalInvoice: inv, reason: title.split("—")[1]?.trim() ?? "Return",
      authorisedBy: "Rajesh Sharma", inspection: "Pending", disposition: "Quarantine",
    }, [makeLine({ item: FG[i % FG.length].code, description: FG[i % FG.length].name, qty: 100 + i * 50, rate: FG[i % FG.length].rate })])),
  );

  [
    ["CN-001", "Credit Note — print defect SR-001", "CUST-001", "INV-001", 7000],
    ["CN-002", "Credit Note — short count SR-002", "CUST-003", "INV-003", 5200],
    ["CN-003", "Credit Note — transit damage SR-003", "CUST-004", "INV-005", 24000],
    ["CN-004", "Credit Note — wrong size SR-004", "CUST-002", "INV-006", 3800],
    ["CN-005", "Credit Note — excess delivery SR-006", "CUST-005", "INV-004", 2600],
    ["CN-006", "Credit Note — goodwill discount", "CUST-001", "INV-007", 5000],
  ].forEach(([code, title, cust, inv, amt], i) =>
    push("credit_notes", rec("credit_notes", code as string, title as string, `2026-08-${22 + i}`, "posted", {
      customer: cust, invoice: inv, amount: amt, reason: title,
    })),
  );

  /* ========== PURCHASE ========== */
  [
    ["SUP-004", "GreenPack Supplies", "Additives & Film", 4.1],
    ["SUP-005", "Himalayan Chemicals", "PBAT/PLA Blends", 4.4],
    ["SUP-006", "Birgunj Trading Co.", "Packaging consumables", 3.9],
    ["SUP-007", "China Resin Nepal Agent", "Import agent", 4.7],
    ["SUP-008", "Local Flexo Inks Ltd.", "Printing inks", 4.0],
  ].forEach(([c, nm, cat, rating], i) =>
    push("suppliers", rec("suppliers", c as string, nm as string, "2026-02-01", "active", {
      category: cat, rating, phone: `+977-98022233${i}`, email: `vendor${i}@example.com.np`,
      paymentTerms: "30 Days", outstanding: 50000 + i * 80000, qualityScore: 85 + i, onTimeDelivery: 80 + i,
    })),
  );

  [
    ["PR-003", "PBAT polymer replenishment", "Production", "2026-09-01"],
    ["PR-004", "Masterbatch colour refresh", "Production", "2026-08-28"],
    ["PR-005", "Starch mills top-up", "Warehouse", "2026-09-05"],
    ["PR-006", "Printing ink consumables", "Production", "2026-08-30"],
    ["PR-007", "Wrap film raw materials", "Production", "2026-09-10"],
    ["PR-008", "Safety stock PLA build", "Warehouse", "2026-09-15"],
  ].forEach(([code, title, dept, reqBy], i) =>
    push("purchase_requisitions", rec("purchase_requisitions", code as string, title as string, `2026-08-${12 + i}`, i % 2 ? "approved" : "pending_approval", {
      department: dept, requestedBy: "Bikash Thapa", requiredBy: reqBy, justification: "Below reorder / production plan",
      priority: i % 3 === 0 ? "High" : "Normal",
    }, [makeLine({ item: RM[i % RM.length].code, description: RM[i % RM.length].name, uom: "KG", qty: 1000 + i * 500, rate: RM[i % RM.length].rate })])),
  );

  [
    ["RFQ-003", "RFQ — PBAT 2,000 KG", "PR-003"],
    ["RFQ-004", "RFQ — Masterbatch 600 KG", "PR-004"],
    ["RFQ-005", "RFQ — Starch 5,000 KG", "PR-005"],
    ["RFQ-006", "RFQ — Printing inks", "PR-006"],
    ["RFQ-007", "RFQ — PBAT/PLA blend trial", "PR-007"],
    ["RFQ-008", "RFQ — PLA safety stock 4T", "PR-008"],
  ].forEach(([code, title, pr], i) =>
    push("rfqs", rec("rfqs", code as string, title as string, `2026-08-${14 + i}`, i < 2 ? "completed" : "in_progress", {
      requisition: pr, vendors: "SUP-001, SUP-005, SUP-007", closingDate: `2026-08-${25 + i}`,
      selectedVendor: i < 2 ? `SUP-00${(i % 3) + 1}` : "",
    }, [makeLine({ item: RM[i % RM.length].code, description: RM[i % RM.length].name, uom: "KG", qty: 2000 + i * 400, rate: RM[i % RM.length].rate })])),
  );

  [
    ["PO-004", "Nepal Polymer — PBAT 2,000 KG", "SUP-001"],
    ["PO-005", "Nepal Polymer — PLA top-up 3,000 KG", "SUP-001"],
    ["PO-006", "GreenPack Supplies — film rolls", "SUP-004"],
    ["PO-007", "Himalayan Chemicals — blend trial", "SUP-005"],
    ["PO-008", "Birgunj Trading — packaging consumables", "SUP-006"],
  ].forEach(([code, title, sup], i) =>
    push("purchase_orders", rec("purchase_orders", code as string, title as string, `2026-08-${16 + i}`, "approved", {
      supplier: sup, paymentTerms: "30 Days", currency: "NPR", deliveryDate: `2026-09-${1 + i}`,
      receiptStatus: ["Pending", "Partial", "Received", "Pending", "At gate"][i],
      billStatus: ["Not billed", "Not billed", "Billed", "Not billed", "Not billed"][i],
    }, [makeLine({ item: i < 3 ? RM[i].code : FG[3].code, description: i < 3 ? RM[i].name : FG[3].name, uom: i < 3 ? "KG" : "ROLL", qty: 1000 + i * 500, rate: i < 3 ? RM[i].rate : FG[3].rate })])),
  );

  [
    ["GE-003", "Gate Entry — Starch delivery", "PO-002"],
    ["GE-004", "Gate Entry — PBAT truck", "PO-004"],
    ["GE-005", "Gate Entry — PLA top-up", "PO-005"],
    ["GE-006", "Gate Entry — Film rolls", "PO-006"],
    ["GE-007", "Gate Entry — Consumables", "PO-008"],
    ["GE-008", "Gate Entry — Blend trial", "PO-007"],
  ].forEach(([code, title, po], i) =>
    push("gate_entries", rec("gate_entries", code as string, title as string, `2026-08-${17 + i}`, "completed", {
      purchaseOrder: po, vehicle: `BA ${8 + i} CHA ${1100 + i}`, driver: ["Suresh", "Ram", "Binod", "Hari", "Kamal", "Dipesh"][i],
      inTime: `0${7 + (i % 2)}:${10 + i}`, securityBy: `Gate ${(i % 2) + 1}`,
    })),
  );

  [
    ["BILL-003", "Kathmandu Starch Mills", "SUP-002", "PO-002"],
    ["BILL-004", "Nepal Polymer — PBAT", "SUP-001", "PO-004"],
    ["BILL-005", "Nepal Polymer — PLA top-up", "SUP-001", "PO-005"],
    ["BILL-006", "GreenPack Supplies", "SUP-004", "PO-006"],
    ["BILL-007", "Birgunj Trading Co.", "SUP-006", "PO-008"],
  ].forEach(([code, title, sup, po], i) =>
    push("purchase_bills", rec("purchase_bills", code as string, title as string, `2026-08-${20 + i}`, i % 2 ? "approved" : "pending_approval", {
      supplier: sup, purchaseOrder: po, dueDate: `2026-09-${15 + i}`, matchStatus: i % 3 === 0 ? "Exception" : "3-Way Matched",
      vendorInvoiceNo: `VND/${26}/${1200 + i}`, paid: i * 100000,
    }, [makeLine({ item: RM[i % RM.length].code, description: RM[i % RM.length].name, uom: "KG", qty: 2000 + i * 200, rate: RM[i % RM.length].rate })])),
  );

  [
    ["OCR-003", "Scanned bill — starch mills", "Kathmandu Starch Mills"],
    ["OCR-004", "Scanned bill — PBAT lot", "Nepal Polymer Imports"],
    ["OCR-005", "Scanned bill — film supplier", "GreenPack Supplies"],
    ["OCR-006", "Scan pending — consumables", ""],
    ["OCR-007", "Scan pending — blend trial", "Himalayan Chemicals"],
    ["OCR-008", "Scanned bill — PLA top-up", "Nepal Polymer Imports"],
  ].forEach(([code, title, vendor], i) =>
    push("ocr_bills", rec("ocr_bills", code as string, title as string, `2026-08-${19 + i}`, i < 4 ? "completed" : "in_progress", {
      source: "PDF Upload", vendor, invoiceNo: i < 4 ? `INV-${2200 + i}` : "", extractedTotal: 500000 + i * 120000,
      confidence: 0.85 + i * 0.02, matchStatus: i < 3 ? "Matched" : "Pending",
    })),
  );

  [
    ["VP-002", "Payment — Starch Mills", "SUP-002", 450000],
    ["VP-003", "Payment — PBAT partial", "SUP-001", 320000],
    ["VP-004", "Payment — GreenPack Supplies", "SUP-004", 180000],
    ["VP-005", "Payment — Birgunj Trading", "SUP-006", 95000],
    ["VP-006", "Payment — Himalayan Chemicals", "SUP-005", 210000],
  ].forEach(([code, title, sup, amt], i) =>
    push("vendor_payments", rec("vendor_payments", code as string, title as string, `2026-08-${22 + i}`, "posted", {
      supplier: sup, mode: "Bank Transfer", bank: "Nabil Bank", reference: `NBL-${9900 + i}`, amount: amt,
    })),
  );

  [
    ["PRT-003", "Return — starch foreign matter", "SUP-002"],
    ["PRT-004", "Return — PBAT moisture fail", "SUP-001"],
    ["PRT-005", "Return — masterbatch colour", "SUP-003"],
    ["PRT-006", "Return — short shipment film", "SUP-004"],
  ].forEach(([code, title, sup], i) =>
    push("purchase_returns", rec("purchase_returns", code as string, title as string, `2026-08-${21 + i}`, "submitted", {
      supplier: sup, reason: title.split("—")[1]?.trim(), inspection: "Failed",
    }, [makeLine({ item: RM[i % RM.length].code, description: RM[i % RM.length].name, uom: "KG", qty: 50 + i * 30, rate: RM[i % RM.length].rate })])),
  );

  [
    ["DBN-002", "Debit Note — starch return", "SUP-002", 21750],
    ["DBN-003", "Debit Note — PBAT moisture", "SUP-001", 32800],
    ["DBN-004", "Debit Note — masterbatch colour", "SUP-003", 12400],
    ["DBN-005", "Debit Note — film short ship", "SUP-004", 9600],
    ["DBN-006", "Debit Note — freight recovery", "SUP-001", 12000],
  ].forEach(([code, title, sup, amt], i) =>
    push("debit_notes", rec("debit_notes", code as string, title as string, `2026-08-${23 + i}`, "posted", {
      supplier: sup, amount: amt, reason: title,
    })),
  );

  /* ========== ACCOUNTING ========== */
  [
    ["EXP-002", "Diesel — factory generators", "Freight & Transport", 42000],
    ["EXP-003", "Office rent — Kathmandu", "Utilities", 85000],
    ["EXP-004", "QC lab consumables", "Utilities", 18000],
    ["EXP-005", "Vehicle maintenance", "Freight & Transport", 32000],
    ["EXP-006", "Internet & telecom", "Utilities", 12000],
    ["EXP-007", "Safety equipment purchase", "Utilities", 28000],
  ].forEach(([code, title, cat, amt], i) =>
    push("expenses", rec("expenses", code as string, title as string, `2026-08-${5 + i}`, "approved", {
      category: cat, account: cat.includes("Freight") ? "5400" : "5300", amount: amt,
      paidBy: i % 2 ? "Cash in Hand" : "Nabil Bank", branch: i % 2 ? "Factory — Bhaktapur" : "Head Office — Kathmandu",
    })),
  );

  [
    ["AST-002", "Extruder Line 2", "Plant & Machinery", 7200000],
    ["AST-003", "Flexo Printer PRN-01", "Plant & Machinery", 2800000],
    ["AST-004", "Forklift — warehouse", "Vehicles", 1850000],
    ["AST-005", "QC Lab equipment suite", "Office Equipment", 950000],
    ["AST-006", "Office IT infrastructure", "Office Equipment", 620000],
  ].forEach(([code, name, cat, cost], i) =>
    push("assets", rec("assets", code as string, name as string, `2025-0${6 + (i % 3)}-01`, "active", {
      category: cat, cost, depreciationPct: cat === "Vehicles" ? 20 : 15,
      wdv: Math.round(Number(cost) * 0.88), location: i < 3 ? "Factory — Bhaktapur" : "Head Office — Kathmandu",
    })),
  );

  [
    ["JV-002", "Sales Invoice INV-003 posting", "INV-003"],
    ["JV-003", "GRN-003 material inward", "GRN-003"],
    ["JV-004", "Payroll July accrual", "PAYRUN-2026-07"],
    ["JV-005", "Expense EXP-002 posting", "EXP-002"],
  ].forEach(([code, title, ref], i) =>
    push("vouchers", rec("vouchers", code as string, title as string, `2026-08-${10 + i}`, "posted", {
      type: i % 2 ? "Journal" : "Payment", reference: ref, narration: title, branch: "Head Office — Kathmandu",
    }, [
      makeLine({ account: "5100", description: "COGS / Expense", debit: 100000 + i * 20000, credit: 0 }),
      makeLine({ account: "2100", description: "Accounts Payable", debit: 0, credit: 100000 + i * 20000 }),
    ])),
  );

  /* ========== HR ========== */
  const extraEmps = [
    ["EMP-007", "Nabin Limbu", "Warehouse", "Warehouse Supervisor", 52000],
    ["EMP-008", "Rita Lama", "Quality", "QC Inspector", 42000],
  ] as const;
  extraEmps.forEach(([code, name, dept, desig, sal]) =>
    push("employees", rec("employees", code, name, "2025-08-01", "active", {
      department: dept, designation: desig, grade: "B", basicSalary: sal, joinDate: "2025-08-01",
      phone: "+977-9841007700", email: `${name.split(" ")[0].toLowerCase()}@ecowrap.com.np`,
      branch: dept === "Warehouse" || dept === "Quality" ? "Factory — Bhaktapur" : "Head Office — Kathmandu",
      leaveBalance: 10, skills: "Operations", contract: "Permanent", ssf: true,
    })),
  );

  [
    ["LV-002", "Bikash Thapa — Sick Leave", "EMP-003", "Sick", 2],
    ["LV-003", "Hari Karki — Casual Leave", "EMP-004", "Casual", 1],
    ["LV-004", "Kiran Magar — Annual Leave", "EMP-005", "Annual", 4],
    ["LV-005", "Anjali Basnet — Personal Leave", "EMP-006", "Personal", 1],
    ["LV-006", "Nabin Limbu — Annual Leave", "EMP-007", "Annual", 3],
    ["LV-007", "Rita Lama — Maternity Leave", "EMP-008", "Maternity", 90],
  ].forEach(([code, title, emp, type, days], i) =>
    push("leave_requests", rec("leave_requests", code as string, title as string, `2026-08-${3 + i}`, i % 2 ? "approved" : "pending_approval", {
      employee: emp, type, from: `2026-09-${1 + i}`, to: `2026-09-${Number(days) + i}`, days,
      reason: `${type} leave request`, balanceBefore: 12 - i, managerApproval: i % 2 ? "Approved" : "Pending",
    })),
  );

  [
    ["REQ-002", "QC Inspector — 1 position", "Quality"],
    ["REQ-003", "Store Assistant — 2 positions", "Warehouse"],
    ["REQ-004", "Sales Executive — 1 position", "Sales"],
    ["REQ-005", "Accountant — junior", "Accounts"],
    ["REQ-006", "Maintenance Technician", "Production"],
  ].forEach(([code, title, dept], i) =>
    push("recruitment", rec("recruitment", code as string, title as string, `2026-07-${20 + i}`, "open", {
      department: dept, positions: 1 + (i % 2), applicants: 8 + i * 3, stage: ["Screening", "Interview", "Offer", "Interview", "Screening"][i],
      hiringManager: dept === "Production" ? "Bikash Thapa" : "Rajesh Sharma",
    })),
  );

  [
    ["PERF-002", "Bikash Thapa — FY 2082/83 H1", "EMP-003"],
    ["PERF-003", "Hari Karki — FY 2082/83 H1", "EMP-004"],
    ["PERF-004", "Kiran Magar — FY 2082/83 H1", "EMP-005"],
    ["PERF-005", "Anjali Basnet — FY 2082/83 H1", "EMP-006"],
    ["PERF-006", "Rajesh Sharma — FY 2082/83 H1", "EMP-001"],
  ].forEach(([code, title, emp], i) =>
    push("performance_reviews", rec("performance_reviews", code as string, title as string, `2026-07-${22 + i}`, i < 2 ? "completed" : "in_progress", {
      employee: emp, cycle: "FY2082/83 H1", selfRating: 3 + (i % 3), managerRating: 3 + (i % 2),
      goals: "Operational excellence and team targets", reviewer: "Rajesh Sharma",
    })),
  );

  [
    ["PAYRUN-2026-08", "Payroll — August 2026", "2026-08"],
    ["PAYRUN-2026-06", "Payroll — June 2026", "2026-06"],
    ["PAYRUN-2026-05", "Payroll — May 2026", "2026-05"],
  ].forEach(([code, title, period], i) =>
    push("payroll_runs", rec("payroll_runs", code as string, title as string, `${period}-28`, i === 0 ? "in_progress" : "approved", {
      period, employees: 8, gross: 380000 + i * 5000, ssf: 41800, tax: 23000, net: 315000, stage: i === 0 ? "Processing" : "Locked",
    })),
  );
}
