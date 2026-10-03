/**
 * Phase 1 browser smoke: login → Purchase PI / LC tabs → open LC workflow.
 * Run: npx playwright test --config=playwright.phase1.config.mjs
 * Or: node scripts/phase1-browser-smoke.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.FE_BASE || "http://127.0.0.1:8081";
const OUT = path.resolve("phase1-browser-shots");
fs.mkdirSync(OUT, { recursive: true });

const log = [];
function step(msg) {
  console.log(msg);
  log.push(msg);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(45000);

  try {
    step(`GOTO ${BASE}/login`);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "01-login.png"), fullPage: true });

    // Fill login — try common selectors
    const email = page.locator('input[type="email"], input[name="email"], input#email').first();
    const password = page.locator('input[type="password"]').first();
    await email.fill("admin@ecowrap.com");
    await password.fill("admin123");
    await page.screenshot({ path: path.join(OUT, "02-login-filled.png"), fullPage: true });

    await page.getByRole("button", { name: /sign in|log in|login/i }).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "03-after-login.png"), fullPage: true });
    step(`AFTER_LOGIN url=${page.url()}`);

    // Navigate Purchase → Proformas
    step("GOTO /purchase/proformas");
    await page.goto(`${BASE}/purchase/proformas`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "04-proformas.png"), fullPage: true });
    const piText = await page.locator("body").innerText();
    step(`PI_PAGE has Proforma=${/proforma/i.test(piText)} New=${/new pi|new proforma/i.test(piText)}`);

    step("GOTO /purchase/letters-of-credit");
    await page.goto(`${BASE}/purchase/letters-of-credit`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "05-letters-of-credit.png"), fullPage: true });
    const lcText = await page.locator("body").innerText();
    step(`LC_PAGE has Letters=${/letter of credit|letters of credit/i.test(lcText)}`);

    // Try open first LC row if any
    const rowLink = page.locator('a[href*="letters-of-credit/"], table a, [data-row] a').first();
    if (await rowLink.count()) {
      await rowLink.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, "06-lc-detail.png"), fullPage: true });
      const detail = await page.locator("body").innerText();
      step(`LC_DETAIL workflow=${/LC workflow|Scan Draft|Run AI match|Seller OK/i.test(detail)}`);
    } else {
      step("LC_DETAIL no rows — try New LC");
      const newBtn = page.getByRole("link", { name: /new lc|new letter/i }).or(page.getByRole("button", { name: /new lc/i }));
      if (await newBtn.count()) {
        await newBtn.first().click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(OUT, "06-lc-new.png"), fullPage: true });
        step(`LC_NEW url=${page.url()}`);
      }
    }

    // Purchase layout tabs check
    await page.goto(`${BASE}/purchase/orders`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, "07-purchase-orders-tabs.png"), fullPage: true });
    const tabs = await page.locator("body").innerText();
    step(`TABS Proforma=${/Proforma/i.test(tabs)} LC=${/Letters of Credit|Letter of Credit/i.test(tabs)}`);

    fs.writeFileSync(path.join(OUT, "log.txt"), log.join("\n"));
    step("DONE");
  } catch (err) {
    step(`ERROR ${err?.message || err}`);
    await page.screenshot({ path: path.join(OUT, "99-error.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT, "log.txt"), log.join("\n"));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
