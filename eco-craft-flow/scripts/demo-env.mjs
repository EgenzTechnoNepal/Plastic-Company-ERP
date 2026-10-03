/**
 * Shared settings for browser smoke scripts. Credentials are never stored in the repo:
 *   FE_BASE=http://127.0.0.1:8081 DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/<script>.mjs
 */
export const FE_BASE = process.env.FE_BASE || "http://127.0.0.1:8081";

export function demoCredentials() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    console.error("Set DEMO_EMAIL and DEMO_PASSWORD (and optionally FE_BASE) before running this script.");
    process.exit(2);
  }
  return { email, password };
}
