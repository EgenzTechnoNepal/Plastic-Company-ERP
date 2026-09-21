export type LeadStage = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface Customer {
  id: string;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  gstin?: string;
  type: "distributor" | "retailer" | "corporate" | "government";
  outstanding: number;
  totalBusiness: number;
  since: string;
}

export interface Lead {
  id: string;
  code: string;
  company: string;
  contact: string;
  phone: string;
  source: "referral" | "website" | "cold_call" | "trade_show" | "social";
  stage: LeadStage;
  value: number;
  owner: string;
  updated: string;
}

export interface Quotation {
  id: string;
  number: string;
  customer: string;
  date: string;
  validTill: string;
  items: number;
  amount: number;
  status: QuotationStatus;
  owner: string;
}

export const CUSTOMERS: Customer[] = [
  { id: "c1", code: "CUS-0001", name: "Himalayan Organic Foods", contact: "Rajan Shrestha", phone: "+977 9801234567", email: "rajan@himalayanorganic.np", city: "Kathmandu", gstin: "601234567PAN", type: "distributor", outstanding: 145000, totalBusiness: 2840000, since: "2022-04-11" },
  { id: "c2", code: "CUS-0002", name: "Everest Retail Chain", contact: "Sunita Rai", phone: "+977 9807654321", email: "procurement@everestretail.np", city: "Pokhara", type: "retailer", outstanding: 0, totalBusiness: 1620000, since: "2023-01-22" },
  { id: "c3", code: "CUS-0003", name: "GreenPack Nepal", contact: "Bikash Thapa", phone: "+977 9812345678", email: "bikash@greenpack.np", city: "Lalitpur", gstin: "607891234PAN", type: "corporate", outstanding: 320000, totalBusiness: 4210000, since: "2021-09-03" },
  { id: "c4", code: "CUS-0004", name: "Ministry of Environment", contact: "R.P. Adhikari", phone: "+977 9841122334", email: "supplies@moenv.gov.np", city: "Kathmandu", type: "government", outstanding: 890000, totalBusiness: 6500000, since: "2020-11-15" },
  { id: "c5", code: "CUS-0005", name: "Kaski Grocers Cooperative", contact: "Manju Gurung", phone: "+977 9856001122", email: "kaskigrocers@coop.np", city: "Pokhara", type: "retailer", outstanding: 45000, totalBusiness: 720000, since: "2024-02-19" },
  { id: "c6", code: "CUS-0006", name: "BioWrap Distributors Pvt. Ltd.", contact: "Anish Karki", phone: "+977 9803344556", email: "anish@biowrap.np", city: "Biratnagar", gstin: "605544332PAN", type: "distributor", outstanding: 210000, totalBusiness: 3120000, since: "2022-07-08" },
];

export const LEADS: Lead[] = [
  { id: "l1", code: "LEAD-0101", company: "Chitwan Farm Fresh", contact: "Devi Poudel", phone: "+977 9845110022", source: "referral", stage: "new", value: 180000, owner: "Sales Rep", updated: "2026-07-18" },
  { id: "l2", code: "LEAD-0102", company: "TrekWorld Nepal", contact: "Nabin Lama", phone: "+977 9812009988", source: "website", stage: "contacted", value: 240000, owner: "Sales Rep", updated: "2026-07-19" },
  { id: "l3", code: "LEAD-0103", company: "Annapurna Foods Ltd.", contact: "Sarita KC", phone: "+977 9807777123", source: "trade_show", stage: "qualified", value: 620000, owner: "Sales Manager", updated: "2026-07-17" },
  { id: "l4", code: "LEAD-0104", company: "Kathmandu Grand Hotel", contact: "P. Manandhar", phone: "+977 9841888999", source: "cold_call", stage: "proposal", value: 410000, owner: "Sales Rep", updated: "2026-07-16" },
  { id: "l5", code: "LEAD-0105", company: "EcoMart Retail", contact: "Rekha Basnet", phone: "+977 9856112233", source: "social", stage: "proposal", value: 275000, owner: "Sales Rep", updated: "2026-07-15" },
  { id: "l6", code: "LEAD-0106", company: "Terai Agro Producers", contact: "Ram Yadav", phone: "+977 9814556677", source: "referral", stage: "won", value: 540000, owner: "Sales Manager", updated: "2026-07-14" },
  { id: "l7", code: "LEAD-0107", company: "PlastiCo Traders", contact: "H. Bhattarai", phone: "+977 9803001122", source: "cold_call", stage: "lost", value: 150000, owner: "Sales Rep", updated: "2026-07-12" },
];

export const QUOTATIONS: Quotation[] = [
  { id: "q1", number: "QT-2026-0142", customer: "Himalayan Organic Foods", date: "2026-07-18", validTill: "2026-08-01", items: 4, amount: 245000, status: "sent", owner: "Sales Rep" },
  { id: "q2", number: "QT-2026-0141", customer: "Everest Retail Chain", date: "2026-07-17", validTill: "2026-07-31", items: 6, amount: 512000, status: "accepted", owner: "Sales Rep" },
  { id: "q3", number: "QT-2026-0140", customer: "GreenPack Nepal", date: "2026-07-16", validTill: "2026-07-30", items: 3, amount: 178000, status: "draft", owner: "Sales Manager" },
  { id: "q4", number: "QT-2026-0139", customer: "Ministry of Environment", date: "2026-07-14", validTill: "2026-07-28", items: 8, amount: 1240000, status: "sent", owner: "Sales Manager" },
  { id: "q5", number: "QT-2026-0138", customer: "Kaski Grocers Cooperative", date: "2026-07-10", validTill: "2026-07-24", items: 2, amount: 96000, status: "rejected", owner: "Sales Rep" },
  { id: "q6", number: "QT-2026-0137", customer: "BioWrap Distributors Pvt. Ltd.", date: "2026-07-05", validTill: "2026-07-19", items: 5, amount: 385000, status: "expired", owner: "Sales Rep" },
];

export const LEAD_STAGES: { id: LeadStage; label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }[] = [
  { id: "new", label: "New", tone: "info" },
  { id: "contacted", label: "Contacted", tone: "info" },
  { id: "qualified", label: "Qualified", tone: "warning" },
  { id: "proposal", label: "Proposal", tone: "warning" },
  { id: "won", label: "Won", tone: "success" },
  { id: "lost", label: "Lost", tone: "danger" },
];

export function quotationTone(status: QuotationStatus): "info" | "warning" | "success" | "danger" | "neutral" {
  switch (status) {
    case "accepted": return "success";
    case "sent": return "info";
    case "draft": return "neutral";
    case "rejected": return "danger";
    case "expired": return "warning";
  }
}

export function formatNPR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(n);
}