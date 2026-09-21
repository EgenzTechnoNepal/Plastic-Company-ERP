import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "ne";

const EN = {
  language: "नेपाली",
  signOut: "Sign out",
  dashboard: "Dashboard",
  settings: "Settings",
  search: "Search customers, products, orders…",
  crm: "CRM",
  sales: "Sales",
  purchase: "Purchase",
  inventory: "Inventory",
  warehouse: "Warehouse",
  production: "Production",
  qualityControl: "Quality Control",
  hr: "HR",
  accounting: "Accounting",
  ird: "IRD / CBMS",
  ai: "AI workspace",
  reports: "Reports",
  notifications: "Notifications",
  approvals: "Approvals",
  auditLogs: "Audit Logs",
  integrations: "Integrations",
} as const;

const NE = {
  language: "English",
  signOut: "साइन आउट",
  dashboard: "ड्यासबोर्ड",
  settings: "सेटिङ",
  search: "ग्राहक, उत्पादन, अर्डर खोज्नुहोस्…",
  crm: "सीआरएम",
  sales: "बिक्री",
  purchase: "खरिद",
  inventory: "स्टक",
  warehouse: "गोदाम",
  production: "उत्पादन",
  qualityControl: "गुणस्तर",
  hr: "मानव संसाधन",
  accounting: "लेखा",
  ird: "आन्तरिक राजस्व / CBMS",
  ai: "एआई कार्यक्षेत्र",
  reports: "प्रतिवेदन",
  notifications: "सूचना",
  approvals: "स्वीकृति",
  auditLogs: "अडिट लग",
  integrations: "एकीकरण",
} as const;

export const DICTS = { en: EN, ne: NE };
export type I18nKey = keyof typeof EN;

const NAV_I18N: Record<string, I18nKey> = {
  Dashboard: "dashboard",
  CRM: "crm",
  Sales: "sales",
  Purchase: "purchase",
  Inventory: "inventory",
  Warehouse: "warehouse",
  Production: "production",
  "Quality Control": "qualityControl",
  HR: "hr",
  Accounting: "accounting",
  "IRD / CBMS": "ird",
  "AI workspace": "ai",
  Reports: "reports",
  Notifications: "notifications",
  Approvals: "approvals",
  "Audit Logs": "auditLogs",
  Settings: "settings",
  Integrations: "integrations",
};

interface I18nState {
  locale: Locale;
  toggle: () => void;
}

const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: "en",
      toggle: () => set((s) => ({ locale: s.locale === "en" ? "ne" : "en" })),
    }),
    { name: "ecowrap-locale" },
  ),
);

export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const toggle = useI18nStore((s) => s.toggle);
  const t = (k: I18nKey) => DICTS[locale][k];
  const navLabel = (english: string) => {
    const key = NAV_I18N[english];
    return key ? t(key) : english;
  };
  return { locale, t, toggle, navLabel };
}
