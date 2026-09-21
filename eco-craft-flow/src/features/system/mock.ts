export type NotificationCategory =
  | "inventory"
  | "approval"
  | "purchase"
  | "sales"
  | "production"
  | "quality"
  | "hr";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  time: string;
  read: boolean;
  priority: "high" | "medium" | "low";
  link?: string;
}

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n-1", title: "Low stock: PLA Resin", body: "PLA Resin (RM-001) fell to 420 kg, below reorder level 800 kg.", category: "inventory", time: "8 min ago", read: false, priority: "high" },
  { id: "n-2", title: "Quotation approval pending", body: "QT-2081-014 for Himalayan Retail (NPR 4,85,000) awaits manager approval.", category: "approval", time: "35 min ago", read: false, priority: "high" },
  { id: "n-3", title: "Goods received", body: "GRN-2081-032 received against PO-2081-021 from Kathmandu Polymers.", category: "purchase", time: "1 hr ago", read: false, priority: "medium" },
  { id: "n-4", title: "Sales order approved", body: "SO-2081-047 confirmed for Everest Mart — delivery due 2081-05-12.", category: "sales", time: "2 hrs ago", read: false, priority: "medium" },
  { id: "n-5", title: "Production completed", body: "PRD-2081-018 finished 12,000 pcs of compostable carry bags.", category: "production", time: "3 hrs ago", read: true, priority: "medium" },
  { id: "n-6", title: "Quality check failed", body: "Batch FG-2081-B14 failed disintegration test — moved to quarantine.", category: "quality", time: "5 hrs ago", read: false, priority: "high" },
  { id: "n-7", title: "Leave request", body: "Sita Rai requested 3 days annual leave from 2081-05-08.", category: "hr", time: "Yesterday", read: true, priority: "low" },
  { id: "n-8", title: "Payment overdue", body: "INV-2081-029 (NPR 1,25,400) is 12 days overdue from Pokhara Traders.", category: "sales", time: "Yesterday", read: true, priority: "high" },
  { id: "n-9", title: "Cycle count variance", body: "Count sheet CNT-2081-006 shows −18 kg variance in bin A-02.", category: "inventory", time: "2 days ago", read: true, priority: "medium" },
  { id: "n-10", title: "Supplier PO pending approval", body: "PO-2081-026 for Biopolymer Nepal needs purchase-head approval.", category: "approval", time: "2 days ago", read: true, priority: "medium" },
];

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | "disabled";
  lastActive: string;
}

export const SYSTEM_USERS: SystemUser[] = [
  { id: "u-1", name: "Admin", email: "admin@ecowrap.com", role: "administrator", status: "active", lastActive: "Just now" },
  { id: "u-2", name: "Rajesh Sharma", email: "manager@ecowrap.com", role: "manager", status: "active", lastActive: "10 min ago" },
  { id: "u-3", name: "Sita Rai", email: "sales@ecowrap.com", role: "sales", status: "active", lastActive: "1 hr ago" },
  { id: "u-4", name: "Hari Karki", email: "warehouse@ecowrap.com", role: "warehouse", status: "active", lastActive: "3 hrs ago" },
  { id: "u-5", name: "Bina Thapa", email: "qc@ecowrap.com", role: "quality_control", status: "active", lastActive: "Yesterday" },
  { id: "u-6", name: "Nabin Gurung", email: "purchase@ecowrap.com", role: "purchase", status: "invited", lastActive: "—" },
  { id: "u-8", name: "Bikash Thapa", email: "production@ecowrap.com", role: "production", status: "active", lastActive: "Just now" },
  { id: "u-7", name: "Anita Shrestha", email: "hr@ecowrap.com", role: "hr", status: "disabled", lastActive: "3 weeks ago" },
];

export const TAX_RATES = [
  { id: "t-1", name: "VAT 13%", rate: 13, applies: "Sales & Purchase" },
  { id: "t-2", name: "VAT Exempt", rate: 0, applies: "Exports" },
  { id: "t-3", name: "TDS 1.5%", rate: 1.5, applies: "Service bills" },
];

export const UNITS = [
  { id: "un-1", name: "Kilogram", code: "kg" },
  { id: "un-2", name: "Piece", code: "pcs" },
  { id: "un-3", name: "Roll", code: "roll" },
  { id: "un-4", name: "Carton", code: "ctn" },
  { id: "un-5", name: "Metre", code: "m" },
];

export const CATEGORIES = [
  { id: "c-1", name: "Raw Material", items: 14 },
  { id: "c-2", name: "Semi Finished", items: 6 },
  { id: "c-3", name: "Finished Goods", items: 22 },
  { id: "c-4", name: "Packaging", items: 9 },
];

export const WAREHOUSES = [
  { id: "w-1", name: "Main Warehouse", location: "Balaju, Kathmandu", bins: 24 },
  { id: "w-2", name: "Production Store", location: "Factory Block B", bins: 12 },
  { id: "w-3", name: "Quarantine Store", location: "Factory Block C", bins: 4 },
];
