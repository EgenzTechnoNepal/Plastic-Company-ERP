/**
 * Visible browser demo — opens a real Chromium WINDOW (not headless).
 * Watch the Chrome window on your desktop.
 */
import { chromium } from "playwright";
import { FE_BASE as BASE, demoCredentials } from "./demo-env.mjs";

const CREDS = demoCredentials();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Opening VISIBLE Chrome window… watch your taskbar / desktop.");
console.log(`Target: ${BASE}`);

const browser = await chromium.launch({
  headless: false,
  slowMo: 450,
  args: ["--start-maximized"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(60000);

try {
  // 1) Login
  console.log("STEP 1: Login page");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pause(2500);
  await page.locator('input[type="email"]').fill(CREDS.email);
  await pause(800);
  await page.locator('input[type="password"]').fill(CREDS.password);
  await pause(800);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  console.log("STEP 2: Dashboard", page.url());
  await pause(3500);

  // 2) Purchase via menu if possible
  console.log("STEP 3: Open Purchase");
  const openMenu = page.getByRole("button", { name: /Open menu/i });
  if (await openMenu.isVisible().catch(() => false)) {
    await openMenu.click();
    await pause(1000);
  }
  const purchaseLink = page.getByRole("link", { name: /^Purchase$/i }).first();
  if (await purchaseLink.isVisible().catch(() => false)) {
    await purchaseLink.click();
  } else {
    await page.goto(`${BASE}/purchase/suppliers`, { waitUntil: "domcontentloaded" });
  }
  await pause(3000);
  console.log("  →", page.url());

  // 3) Proformas tab
  console.log("STEP 4: Proforma (PI) list");
  const piTab = page.getByRole("link", { name: /Proforma \(PI\)/i });
  if (await piTab.isVisible().catch(() => false)) {
    await piTab.click();
  } else {
    await page.goto(`${BASE}/purchase/proformas`, { waitUntil: "domcontentloaded" });
  }
  await pause(3500);
  console.log("  →", page.url());

  // 4) New PI form
  console.log("STEP 5: New PI form");
  const newPi = page.getByRole("link", { name: /New PI/i });
  if (await newPi.isVisible().catch(() => false)) {
    await newPi.click();
  } else {
    await page.goto(`${BASE}/purchase/proformas/new`, { waitUntil: "domcontentloaded" });
  }
  await pause(4000);
  console.log("  →", page.url());

  // Light form interaction (do not submit)
  const seller = page.getByLabel(/Seller PI|Seller/i).first();
  if (await seller.isVisible().catch(() => false)) {
    await seller.fill("PI-LIVE-BROWSER");
    await pause(1200);
  }

  // 5) Letters of Credit
  console.log("STEP 6: Letters of Credit list");
  await page.goto(`${BASE}/purchase/letters-of-credit`, { waitUntil: "domcontentloaded" });
  await pause(3500);
  console.log("  →", page.url());

  // 6) LC detail with workflow
  console.log("STEP 7: LC detail + workflow");
  await page.goto(`${BASE}/purchase/letters-of-credit/LC-0000-000003`, {
    waitUntil: "domcontentloaded",
  });
  await pause(2500);
  const workflow = page.getByText(/LC workflow \(Phase 1\)/i);
  if (await workflow.count()) {
    await workflow.scrollIntoViewIfNeeded();
  }
  await pause(4000);
  console.log("  →", page.url());

  // 7) Draft LC + click scan (visible action)
  console.log("STEP 8: Draft LC workflow buttons");
  await page.goto(`${BASE}/purchase/letters-of-credit/LC-0000-000001`, {
    waitUntil: "domcontentloaded",
  });
  await pause(2000);
  const wf = page.getByText(/LC workflow \(Phase 1\)/i);
  if (await wf.count()) await wf.scrollIntoViewIfNeeded();
  await pause(1500);
  const amt = page.locator("text=Draft LC amount").locator("..").locator("input").first();
  if (await amt.count()) {
    await amt.fill("100000");
    await pause(800);
  }
  const scan = page.getByRole("button", { name: /1\.\s*Scan Draft LC/i });
  if (await scan.count()) {
    await scan.click();
    await pause(2500);
  }
  const match = page.getByRole("button", { name: /2\.\s*Run AI match/i });
  if (await match.count()) {
    await match.click();
    await pause(3000);
  }
  console.log("  →", page.url());

  console.log("DONE — Chrome stays open 90 seconds. Watch that window.");
  await pause(90000);
} catch (e) {
  console.error("ERROR:", e.message);
  await pause(10000);
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log("Chrome closed.");
}
