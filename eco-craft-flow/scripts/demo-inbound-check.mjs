/**
 * Inbound journey browser check (backend freshly seeded with seed_m2_demo_chain; consumes PO-M2-DEMO-002):
 *   FE_BASE=http://127.0.0.1:8081 DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/demo-inbound-check.mjs
 * Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of Playwright's bundled one.
 *
 * Drives the PO detail inbound panel: LC gate refusal (PO-M2-DEMO-003), then
 * Gate → GRN (QC hold) → QC pass → landed cost → putaway on PO-M2-DEMO-002, checking the server after each step.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { FE_BASE as BASE, demoCredentials } from "./demo-env.mjs";

const CREDS = demoCredentials();
const API = `${BASE}/api/v1`;
const OUT = path.resolve("demo-check-shots");
fs.mkdirSync(OUT, { recursive: true });

const LIVE_PO = "PO-M2-DEMO-002";
const BLOCKED_PO = "PO-M2-DEMO-003";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const results = [];
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  results.push({ name, pass });
};

async function api(method, url, token, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json?.data ?? json };
}

const login = await api("POST", "/auth/login/", null, { email: CREDS.email, password: CREDS.password });
const token = login.data?.access;
if (!token) {
  console.error(`API login failed (HTTP ${login.status}); is the backend reachable through ${BASE}?`);
  process.exit(1);
}
async function findPo(number) {
  const rows = (await api("GET", `/purchase/purchase-orders/?search=${number}&page_size=50`, token)).data || [];
  return rows.find((r) => r.document_number === number);
}
const livePo = await findPo(LIVE_PO);
const blockedPo = await findPo(BLOCKED_PO);
if (!livePo || !blockedPo) {
  console.error(`${LIVE_PO}/${BLOCKED_PO} not found - run seed_m2_demo_chain first.`);
  process.exit(1);
}
const journey = async (po) => (await api("GET", `/purchase/purchase-orders/${po.id}/inbound-journey/`, token)).data;
const initial = await journey(livePo);
if (initial.gates?.length) {
  console.error(`${LIVE_PO} already has a gate entry - restore a freshly seeded demo database first.`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || undefined });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.setDefaultTimeout(30000);
const shot = (name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });
const panel = page.getByTestId("inbound-journey");
const stage = (title) => panel.locator(`[data-stage="${title}"]`);
const mockSnapshot = async () => {
  const raw = await page.evaluate(() => window.localStorage.getItem("greenflow-erp-db"));
  if (!raw) return "";
  const state = JSON.parse(raw).state ?? {};
  return JSON.stringify({ approvals: state.approvals, audit: state.audit, notifications: state.notifications, records: state.records });
};
async function waitServer(check, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    const j = await journey(livePo);
    if (check(j)) return j;
    await page.waitForTimeout(500);
  }
  return journey(livePo);
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(CREDS.email);
  await page.locator('input[type="password"]').fill(CREDS.password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  const mockBefore = await mockSnapshot();

  // LC gate: documents not cleared, so the server refuses the truck.
  await page.goto(`${BASE}/purchase/orders/${BLOCKED_PO}`, { waitUntil: "networkidle" });
  await panel.waitFor();
  ok("blocked PO shows LC gate closed", /LC gate: closed/i.test(await stage("Proforma invoice & letter of credit").innerText()));
  await stage("Gate entry").getByLabel("Vehicle number").fill("Ko 9 Pa 0001");
  await stage("Gate entry").getByRole("button", { name: /Attempt gate entry/i }).click();
  const refusal = page.locator("[data-sonner-toast]", { hasText: /LC|Pre-dispatch/i }).first();
  await refusal.waitFor({ timeout: 15000 });
  await shot("10-inbound-lc-blocked.png");
  const blockedGates = (await journey(blockedPo)).gates ?? [];
  ok("server refused gate entry for uncleared LC", blockedGates.length === 0, (await refusal.innerText()).slice(0, 90));

  // Live PO: names and terms, no raw ids.
  await page.goto(`${BASE}/purchase/orders/${LIVE_PO}`, { waitUntil: "networkidle" });
  await panel.waitFor();
  const poText = await stage("Purchase order").innerText();
  ok("PO shows supplier, terms and total", /China Raw Material Supplier/.test(poText) && /LC 30 Days/.test(poText) && /NPR 100,000\.00/.test(poText));
  ok("PO panel shows no raw UUIDs", !UUID.test(await panel.innerText()));
  const lcText = await stage("Proforma invoice & letter of credit").innerText();
  ok("LC shown as rules-based and cleared", /rules-based check/i.test(lcText) && /LC gate: open/i.test(lcText) && !/\bAI\b/.test(lcText));
  await shot("11-inbound-po.png");

  await stage("Gate entry").getByLabel("Vehicle number").fill("Ko 2 Kha 1357");
  await stage("Gate entry").getByLabel("Driver").fill("Shyam Thapa");
  await stage("Gate entry").getByRole("button", { name: /Record gate entry/i }).click();
  let j = await waitServer((x) => x.gates?.some((g) => g.status === "SUBMITTED"));
  ok("gate entry recorded on server", j.gates?.[0]?.status === "SUBMITTED", j.gates?.[0]?.number);

  await stage("Goods receipt (GRN)").getByRole("button", { name: /Post GRN/i }).click();
  j = await waitServer((x) => x.lots?.length > 0);
  const lot0 = j.lots?.[0];
  ok("GRN posted: lot in QC_HOLD bin, not available", lot0?.status === "QC_HOLD" && lot0?.bin?.type === "QC_HOLD", `${lot0?.lot_number} ${lot0?.status} ${lot0?.bin?.code}`);
  ok("gate linked to GRN", j.gates?.[0]?.status === "LINKED_TO_GRN");
  await stage("Quality control").getByText("QC HOLD").first().waitFor();
  ok("UI offers no putaway while on QC hold", (await stage("Available inventory").getByRole("button", { name: /Put away/i }).count()) === 0);
  await shot("12-inbound-qc-hold.png");

  await stage("Quality control").getByLabel("CoA reference").fill("COA-CN-PLA-0502");
  await stage("Quality control").getByRole("button", { name: /QC Pass/i }).click();
  j = await waitServer((x) => x.lots?.[0]?.status === "AVAILABLE");
  ok("QC pass makes lot AVAILABLE", j.lots?.[0]?.status === "AVAILABLE");

  const landed = stage("Landed cost");
  for (const [label, amount] of [
    ["International Freight", "12000"],
    ["Insurance", "3000"],
    ["Customs Duty", "8000"],
    ["Clearing", "2000"],
    ["Nepal Transport", "3000"],
  ]) {
    await landed.getByLabel(label, { exact: true }).fill(amount);
  }
  await landed.getByRole("button", { name: /Post landed cost/i }).click();
  j = await waitServer((x) => Boolean(x.lots?.[0]?.landed_unit_cost));
  const lot1 = j.lots?.[0];
  ok(
    "landed cost 1,280/KG with purchase 1,000 preserved",
    Number(lot1?.landed_unit_cost) === 1280 && Number(lot1?.purchase_unit_cost) === 1000,
    `purchase=${lot1?.purchase_unit_cost} landed=${lot1?.landed_unit_cost}`,
  );
  await landed.getByText("NPR 128,000.00").first().waitFor();
  ok("UI shows landed total NPR 128,000.00", true);
  await shot("13-inbound-landed.png");

  const avail = stage("Available inventory");
  const rmValue = await avail.locator("option", { hasText: "RM-01" }).getAttribute("value");
  await avail.locator("select").selectOption(rmValue);
  await avail.getByRole("button", { name: /Put away/i }).click();
  j = await waitServer((x) => x.lots?.[0]?.bin?.code === "RM-01");
  const lot2 = j.lots?.[0];
  ok("putaway: AVAILABLE in RM-01", lot2?.status === "AVAILABLE" && lot2?.bin?.code === "RM-01", `${lot2?.status} ${lot2?.bin?.code}`);
  const txns = new Set((lot2?.ledger ?? []).map((e) => e.txn_type));
  ok("ledger has receipt, QC release, landed revalue", ["GRN_RECEIPT", "QC_RELEASE", "LANDED_COST_REVALUE"].every((t) => txns.has(t)), [...txns].join(","));
  await avail.locator("summary").first().click();
  await shot("14-inbound-available.png");

  const mockAfter = await mockSnapshot();
  ok("offline mock store untouched in live session", mockAfter === mockBefore);
} catch (err) {
  ok("unexpected error", false, err.message);
  await shot("99-inbound-error.png").catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`RESULT ${failed.length ? `FAIL (${failed.length})` : "PASS"} - ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
