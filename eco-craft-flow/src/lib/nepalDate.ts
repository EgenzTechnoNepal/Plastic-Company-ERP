/**
 * AD ↔ Bikram Sambat display helper (proposal §1.4).
 * Month lengths cover 2078–2086 BS (the EcoWrap demo fiscal window).
 * Outside that range the label is an approximate conversion.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CalendarPref = "ad" | "bs";

const MONTHS_BS: Record<number, number[]> = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

/** 2081-01-01 BS = 2024-04-13 AD (UTC date parts). */
const EPOCH_AD = Date.UTC(2024, 3, 13);
const EPOCH_BS = { y: 2081, m: 1, d: 1 };

function daysInBsMonth(y: number, m: number): number {
  return MONTHS_BS[y]?.[m - 1] ?? 30;
}

function addBsDays(startY: number, startM: number, startD: number, delta: number) {
  let y = startY;
  let m = startM;
  let d = startD + delta;
  if (d > 0) {
    while (true) {
      const dim = daysInBsMonth(y, m);
      if (d <= dim) break;
      d -= dim;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  } else {
    while (d <= 0) {
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      d += daysInBsMonth(y, m);
    }
  }
  return { y, m, d };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function adToBs(isoOrDate: string | Date): { y: number; m: number; d: number; label: string } {
  const dt = typeof isoOrDate === "string" ? new Date(`${isoOrDate.slice(0, 10)}T00:00:00Z`) : isoOrDate;
  if (Number.isNaN(dt.getTime())) {
    return { y: 0, m: 0, d: 0, label: "—" };
  }
  const utc = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  const delta = Math.round((utc - EPOCH_AD) / 86_400_000);
  const { y, m, d } = addBsDays(EPOCH_BS.y, EPOCH_BS.m, EPOCH_BS.d, delta);
  return { y, m, d, label: `${y}-${pad(m)}-${pad(d)}` };
}

export function formatAd(iso?: string): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function formatDualDate(iso?: string): { ad: string; bs: string } {
  const ad = formatAd(iso);
  if (ad === "—") return { ad, bs: "—" };
  return { ad, bs: adToBs(ad).label };
}

interface CalendarState {
  pref: CalendarPref;
  toggle: () => void;
}

const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      pref: "ad",
      toggle: () => set((s) => ({ pref: s.pref === "ad" ? "bs" : "ad" })),
    }),
    { name: "ecowrap-calendar" },
  ),
);

export function useCalendar() {
  const pref = useCalendarStore((s) => s.pref);
  const toggle = useCalendarStore((s) => s.toggle);
  return { pref, toggle };
}
