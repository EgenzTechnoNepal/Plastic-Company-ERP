import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.FE_BASE || "http://127.0.0.1:8081";
const OUT = path.resolve("phase1-browser-shots");
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const step = (m) => {
  console.log(m);
  log.push(m);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // Click demo admin chip if present
  const adminChip = page.getByText("admin@ecowrap.com").first();
  if (await adminChip.count()) {
    await adminChip.click();
    await page.waitForTimeout(300);
  }
  await page.locator('input[type="email"]').fill("admin@ecowrap.com");
  await page.locator('input[type="password"]').fill("admin123");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 }).catch(() => null),
    page.getByRole("button", { name: /^Sign in$/i }).click(),
  ]);
  await page.waitForTimeout(2000);
  step(`LOGIN_URL=${page.url()}`);
  if (page.url().includes("/login")) {
    // retry once
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForTimeout(3000);
    step(`LOGIN_RETRY=${page.url()}`);
  }
  await page.screenshot({ path: path.join(OUT, "20-logged-in.png"), fullPage: true });
}

try {
  await login();
  if (page.url().includes("/login")) throw new Error("Login failed");

  await page.goto(`${BASE}/purchase/proformas`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "21-pi-list.png"), fullPage: true });
  step(`PI_OK=${/Proforma \(PI\)|PROFORMA INVOICES/i.test(await page.locator("body").innerText())}`);

  await page.goto(`${BASE}/purchase/letters-of-credit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "22-lc-list.png"), fullPage: true });
  step(`LC_OK=${/Letters of Credit|LETTERS OF CREDIT/i.test(await page.locator("body").innerText())}`);

  // Force navigation using rowHref pattern
  await page.goto(`${BASE}/purchase/letters-of-credit/${encodeURIComponent("LC-0000-000001")}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "23-lc-detail.png"), fullPage: true });
  const detail = await page.locator("body").innerText();
  step(`DETAIL_URL=${page.url()}`);
  step(`WORKFLOW=${/LC workflow \(Phase 1\)/i.test(detail)}`);
  step(`SNIPPET=${detail.slice(0, 400).replaceAll("\n", " | ")}`);

  if (/LC workflow \(Phase 1\)/i.test(detail)) {
    await page.getByRole("button", { name: /1\. Scan Draft LC/i }).click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /2\. Run AI match/i }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "24-after-match.png"), fullPage: true });
    step(`AFTER=${(await page.locator("body").innerText()).match(/Match passed|Match failed|toast|error/i)?.[0] || "none"}`);
  }

  await page.goto(`${BASE}/purchase/proformas/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "25-new-pi.png"), fullPage: true });
  step(`NEW_PI=${page.url()} form=${/Product code|Purchase Order|Proforma|New /i.test(await page.locator("body").innerText())}`);

  fs.writeFileSync(path.join(OUT, "log-final.txt"), log.join("\n"));
  step("BROWSER_PASS");
} catch (e) {
  step(`ERROR ${e.message}`);
  await page.screenshot({ path: path.join(OUT, "99-final-error.png"), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(OUT, "log-final.txt"), log.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
