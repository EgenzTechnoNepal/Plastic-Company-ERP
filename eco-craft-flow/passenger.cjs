/**
 * CloudLinux / Phusion Passenger entry for TanStack Start.
 * Startup file in cPanel: passenger.cjs
 *
 * Serves dist/client (+ public) static files, then falls through to the
 * TanStack Start fetch handler for SSR / API-ish routes.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = __dirname;
const CLIENT_DIR = path.join(ROOT, "dist", "client");
const PUBLIC_DIR = path.join(ROOT, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

let entryPromise;

async function getEntry() {
  if (!entryPromise) {
    const url = pathToFileURL(path.join(ROOT, "dist", "server", "server.js")).href;
    const mod = await import(url);
    const entry = mod.default;
    if (!entry || typeof entry.fetch !== "function") {
      throw new Error("dist/server/server.js must export default { fetch }");
    }
    entryPromise = entry;
  }
  return entryPromise;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function toRequest(req, body) {
  const host = req.headers.host || "127.0.0.1";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, String(value));
  }
  const init = { method: req.method || "GET", headers };
  if (body.length && req.method !== "GET" && req.method !== "HEAD") {
    init.body = body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const cleaned = path.posix.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(root, cleaned);
  if (!abs.startsWith(root)) return null;
  return abs;
}

function tryStatic(req, res) {
  if ((req.method || "GET") !== "GET" && (req.method || "GET") !== "HEAD") {
    return false;
  }
  const urlPath = (req.url || "/").split("?")[0];
  // Only treat paths with an extension (or /assets/) as static candidates.
  if (!urlPath.includes(".") && !urlPath.startsWith("/assets/")) return false;

  for (const root of [CLIENT_DIR, PUBLIC_DIR]) {
    const filePath = safeJoin(root, urlPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("content-type", MIME[ext] || "application/octet-stream");
    res.setHeader("cache-control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
    if ((req.method || "GET") === "HEAD") {
      res.end();
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    if (tryStatic(req, res)) return;

    const body = await readBody(req);
    const entry = await getEntry();
    const response = await entry.fetch(toRequest(req, body));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error\n" + String(err && err.stack ? err.stack : err));
  }
});

if (typeof PhusionPassenger !== "undefined") {
  PhusionPassenger.configure({ autoInstall: false });
  server.listen("passenger");
} else {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "127.0.0.1", () => {
    console.log(`EcoWrap listening on ${port}`);
  });
}
