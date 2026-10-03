import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { FE_BASE as BASE, demoCredentials } from "./demo-env.mjs";

const CREDS = demoCredentials();
const OUT = path.resolve("phase1-browser-shots");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
page.setDefaultTimeout(45000);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.locator('input[type="email"]').fill(CREDS.email);
await page.locator('input[type="password"]').fill(CREDS.password);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 }),
  page.getByRole("button", { name: /^Sign in$/i }).click(),
]);

const checks = [];
async function visit(name, url, re) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const t = await page.locator("body").innerText();
  const pass = !page.url().includes("/login") && re.test(t);
  checks.push({ name, pass, url: page.url() });
  await page.screenshot({ path: path.join(OUT, `fix-${name}.png`), fullPage: true });
  console.log(pass ? "PASS" : "FAIL", name, page.url());
}

await visit("po-orders", "/purchase/orders", /Purchase Order|PO-|Orders/i);
await visit("pi-list", "/purchase/proformas", /Proforma|PI-/i);
await visit("lc-list", "/purchase/letters-of-credit", /Letters of Credit|LC-/i);
await visit("lc-draft", "/purchase/letters-of-credit/LC-0000-000001", /LC workflow|Draft|Letter/i);
await visit("suppliers", "/purchase/suppliers", /Supplier/i);
await visit("gate", "/purchase/gate-entries", /Gate/i);
await visit("grn", "/purchase/receipts", /Goods Receipt|GRN|Receipt/i);

const allOk = checks.every((c) => c.pass);
fs.writeFileSync(
  path.join(OUT, "fix-report.txt"),
  checks.map((c) => `${c.pass ? "PASS" : "FAIL"} ${c.name} ${c.url}`).join("\n") + `\nALL ${allOk ? "OK" : "HAS_FAILS"}`,
);
console.log("ALL", allOk ? "OK" : "HAS_FAILS");
await browser.close();
process.exitCode = allOk ? 0 : 1;
