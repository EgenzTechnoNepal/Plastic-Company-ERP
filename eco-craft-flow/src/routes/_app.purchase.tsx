import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  FileText,
  PackageCheck,
  Wallet,
  Undo2,
  ScanLine,
  ClipboardList,
  GitCompare,
  Truck,
  Receipt,
  FileMinus,
  FileSpreadsheet,
  Landmark,
} from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/purchase")({
  component: PurchaseLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/purchase/suppliers", label: "Suppliers", icon: Users, formKey: "supplier", formLabel: "New Supplier" },
  { to: "/purchase/requisitions", label: "Requisitions", icon: ClipboardList, formKey: "purchaseRequisition", formLabel: "New PR" },
  { to: "/purchase/rfqs", label: "RFQ", icon: GitCompare, formKey: "rfq", formLabel: "New RFQ" },
  { to: "/purchase/orders", label: "Purchase Orders", icon: FileText, formKey: "purchaseOrder", formLabel: "New PO" },
  { to: "/purchase/proformas", label: "Proforma (PI)", icon: FileSpreadsheet, formKey: "proformaInvoice", formLabel: "New PI" },
  { to: "/purchase/letters-of-credit", label: "Letters of Credit", icon: Landmark, formKey: "letterOfCredit", formLabel: "New LC" },
  { to: "/purchase/gate-entries", label: "Gate entry", icon: Truck, formKey: "gateEntry", formLabel: "New Gate Entry" },
  { to: "/purchase/receipts", label: "Goods Receipt", icon: PackageCheck, formKey: "goodsReceipt", formLabel: "New GRN" },
  { to: "/purchase/bills", label: "Vendor bills", icon: Receipt, formKey: "vendorBill", formLabel: "New Bill" },
  { to: "/purchase/ocr", label: "Bill Scanning", icon: ScanLine, formKey: "ocrBill", formLabel: "Scan Bill" },
  { to: "/purchase/payments", label: "Vendor Payments", icon: Wallet, formKey: "vendorPayment", formLabel: "New Payment" },
  { to: "/purchase/returns", label: "Purchase Return", icon: Undo2, formKey: "purchaseReturn", formLabel: "New Return" },
  { to: "/purchase/debit-notes", label: "Debit notes", icon: FileMinus, formKey: "debitNote", formLabel: "New Debit Note" },
];

function PurchaseLayout() {
  return (
    <ModuleTabsLayout
      title="Purchase"
      description="PR → PO → PI → LC (Draft scan / AI match) → gate → GRN → QC → bill · returns · OCR"
      tabs={TABS}
    />
  );
}
