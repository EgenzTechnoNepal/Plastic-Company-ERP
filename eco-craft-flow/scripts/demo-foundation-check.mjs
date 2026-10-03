/**
 * Demo foundation browser check (requires a backend seeded with seed_m2_demo_chain):
 *   FE_BASE=http://127.0.0.1:8081 DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/demo-foundation-check.mjs
 * Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of Playwright's bundled one.
 *
 * Verifies real auth (no offline fallback), typed approval inbox decisions, seeded typed
 * records in list/detail views, and that the offline mock store is never written in a live session.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { FE_BASE as BASE, demoCredentials } from "./demo-env.mjs";

const CREDS = demoCredentials();
const API = `${BASE}/api/v1`;
const OUT = path.resolve("demo-check-shots");
fs.mkdirSync(OUT, { recursive: true });

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
const pos = await api("GET", "/purchase/purchase-orders/?search=PO-M2-DEMO-001&page_size=50", token);
const po = (pos.data || []).find((r) => r.document_number === "PO-M2-DEMO-001");
if (!po) {
  console.error("PO-M2-DEMO-001 not found - run seed_m2_demo_chain first.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || undefined });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
page.setDefaultTimeout(30000);
const shot = (name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });
const body = () => page.locator("body").innerText();
const storage = (key) => page.evaluate((k) => window.localStorage.getItem(k), key);
const mockSnapshot = async () => {
  const raw = await storage("greenflow-erp-db");
  if (!raw) return "";
  const state = JSON.parse(raw).state ?? {};
  return JSON.stringify({ approvals: state.approvals, audit: state.audit, notifications: state.notifications, records: state.records });
};

async function signIn(password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(CREDS.email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
}

try {
  // Unreachable server must not fall back to an offline demo session.
  await page.route("**/api/v1/auth/login/**", (route) => route.abort());
  await signIn(CREDS.password);
  await page.waitForTimeout(1500);
  ok("server unreachable: no offline login", page.url().includes("/login"), page.url());
  ok("server unreachable: error shown", /Cannot reach the ERP server/i.test(await body()));
  await page.unroute("**/api/v1/auth/login/**");

  await signIn(`${CREDS.password}-wrong`);
  await page.waitForTimeout(1500);
  ok("wrong password stays on login", page.url().includes("/login"), page.url());
  await shot("01-wrong-password.png");

  await signIn(CREDS.password);
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  const auth = JSON.parse((await storage("ecowrap-auth")) || "{}");
  ok("login uses live API session", auth?.state?.source === "api", `source=${auth?.state?.source}`);
  const mockBefore = await mockSnapshot();

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("02-dashboard.png");
  ok("dashboard loads", page.url().includes("/dashboard") && !/Cannot reach/i.test(await body()));

  // Typed approval decided from the inbox UI.
  const open = await api("GET", "/workflow/approval-requests/?status=PENDING&page_size=200", token);
  for (const row of (open.data || []).filter((r) => r.target_id === po.id)) {
    await api("POST", `/workflow/approval-requests/${row.id}/cancel/`, token, { reason: "browser check reset" });
  }
  const title = `Browser check ${Date.now()}`;
  const created = await api("POST", "/workflow/approval-requests/", token, {
    company: po.company,
    module_code: "purchase",
    target_type: "procurement.PurchaseOrder",
    target_id: po.id,
    document_number: po.document_number,
    title,
  });
  ok("typed approval request created", created.status === 201, `HTTP ${created.status}`);

  await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^pending$/i }).click();
  const card = page.locator("div.rounded-2xl", { hasText: title }).first();
  await card.waitFor({ timeout: 15000 });
  await shot("03-approvals-pending.png");
  await card.getByRole("button", { name: /^Approve$/ }).click();
  let decided = null;
  for (let i = 0; i < 20 && decided?.status !== "APPROVED"; i += 1) {
    await page.waitForTimeout(500);
    decided = (await api("GET", `/workflow/approval-requests/${created.data.id}/`, token)).data;
  }
  ok("inbox Approve decided on server", decided?.status === "APPROVED", `status=${decided?.status}, by=${decided?.decided_by_email}`);
  await page.getByRole("button", { name: /^decided$/i }).click();
  await page.locator("div.rounded-2xl", { hasText: title }).first().waitFor({ timeout: 15000 });
  await shot("04-approvals-decided.png");
  ok("decided request shown with server decider", /decided by/i.test(await page.locator("div.rounded-2xl", { hasText: title }).first().innerText()));

  // Seeded typed records through list/detail views.
  await page.goto(`${BASE}/purchase/orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  ok("PO list shows seeded PO", (await body()).includes("PO-M2-DEMO-001"));
  await page.goto(`${BASE}/purchase/orders/PO-M2-DEMO-001`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("05-po-detail.png");
  const poText = await body();
  ok("PO detail loads from server", poText.includes("PO-M2-DEMO-001") && !/not found|Could not load/i.test(poText));

  await page.goto(`${BASE}/purchase/letters-of-credit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  ok("LC list shows seeded LC", (await body()).includes("LC-M2-DEMO-001"));
  await page.goto(`${BASE}/purchase/letters-of-credit/LC-M2-DEMO-001`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot("06-lc-detail.png");
  ok("LC detail shows DOCS_CLEARED", /DOCS_CLEARED|Docs cleared/i.test(await body()));

  const mockAfter = await mockSnapshot();
  const changed = mockBefore && mockAfter
    ? Object.keys(JSON.parse(mockBefore)).filter(
        (k) => JSON.stringify(JSON.parse(mockBefore)[k]) !== JSON.stringify(JSON.parse(mockAfter)[k]),
      )
    : [];
  ok("offline mock store untouched in live session", mockAfter === mockBefore, changed.length ? `changed: ${changed.join(", ")}` : "");
} catch (err) {
  ok("unexpected error", false, err.message);
  await shot("99-error.png").catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`RESULT ${failed.length ? `FAIL (${failed.length})` : "PASS"} - ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
