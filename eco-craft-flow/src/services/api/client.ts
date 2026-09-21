/**
 * Django REST client. Unwraps { data, meta } / { error } envelopes,
 * attaches JWT, and rotates the access token on 401.
 */
import { toast } from "sonner";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Skip Authorization header (login / refresh). */
  anonymous?: boolean;
  /** Skip toast on error — caller handles it. */
  silent?: boolean;
}

export interface ApiMeta {
  count?: number;
  page?: number;
  page_size?: number;
  num_pages?: number;
  next?: string | null;
  previous?: string | null;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, unknown>;

  constructor(code: string, message: string, status: number, fields: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

const ERROR_TOAST: Record<string, string> = {
  PERIOD_CLOSED: "This fiscal period is closed for posting.",
  INSUFFICIENT_STOCK: "Not enough stock for this movement.",
  CREDIT_LIMIT_EXCEEDED: "This document would exceed the customer credit limit.",
  APPROVAL_REQUIRED: "This document needs approval before that action.",
  INVALID_STATUS_TRANSITION: "That status change is not allowed.",
  THREE_WAY_MATCH_FAILED: "PO, GRN and bill quantities or amounts do not match.",
  PAYMENT_EXCEEDS_OUTSTANDING: "Payment is larger than the outstanding balance.",
  DEBIT_CREDIT_MISMATCH: "Journal debits must equal credits.",
  PERMISSION_DENIED: "You do not have permission for this action.",
  INVALID_TOKEN: "Your session expired. Please sign in again.",
  account_locked: "Account locked after too many failed attempts. Try again later.",
  INTERNAL_ERROR: "Something went wrong. Try again or contact support.",
};

export function toastApiError(err: unknown) {
  if (err instanceof ApiError) {
    toast.error(ERROR_TOAST[err.code] ?? err.message);
    return;
  }
  if (err instanceof Error) {
    toast.error(err.message);
    return;
  }
  toast.error("Request failed");
}

export interface TokenProvider {
  getAccess: () => string | null;
  getRefresh: () => string | null;
  setTokens: (access: string, refresh: string) => void;
  clear: () => void;
}

let tokenProvider: TokenProvider | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

function joinUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.startsWith("http")) return p;
  if (base.startsWith("http")) return `${base}${p}`;
  if (p.startsWith("/api/")) return p;
  return `${base}${p}`;
}

function withQuery(path: string, query?: ApiOptions["query"]): string {
  const joined = joinUrl(path);
  const url = joined.startsWith("http")
    ? new URL(joined)
    : new URL(joined, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return joined.startsWith("http") ? url.toString() : url.pathname + url.search;
}

function unwrap(json: unknown, status: number): { data: unknown; meta: ApiMeta } {
  if (json && typeof json === "object") {
    const body = json as Record<string, unknown>;
    if (body.error && typeof body.error === "object") {
      const err = body.error as { code?: string; message?: string; fields?: Record<string, unknown> };
      throw new ApiError(err.code ?? "ERROR", err.message ?? "Request failed", status, err.fields ?? {});
    }
    if ("data" in body) {
      return { data: body.data, meta: (body.meta as ApiMeta) ?? {} };
    }
  }
  return { data: json, meta: {} };
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refresh = tokenProvider?.getRefresh();
  if (!refresh) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(withQuery("/auth/refresh/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      const json = await parseBody(res);
      if (!res.ok) {
        tokenProvider?.clear();
        return false;
      }
      const { data } = unwrap(json, res.status);
      const payload = data as { access?: string; refresh?: string };
      if (!payload.access) return false;
      tokenProvider?.setTokens(payload.access, payload.refresh ?? refresh);
      return true;
    } catch {
      tokenProvider?.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { data } = await apiFetchMeta<T>(path, opts);
  return data;
}

export async function apiFetchMeta<T>(path: string, opts: ApiOptions = {}): Promise<{ data: T; meta: ApiMeta }> {
  const target = withQuery(path, opts.query);

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const access = opts.anonymous ? null : tokenProvider?.getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const exec = () =>
    fetch(target, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

  let res = await exec();
  if (res.status === 401 && !opts.anonymous && tokenProvider?.getRefresh()) {
    const ok = await tryRefresh();
    if (ok) {
      const next = tokenProvider.getAccess();
      if (next) headers.Authorization = `Bearer ${next}`;
      res = await exec();
    }
  }

  const json = await parseBody(res);
  try {
    const unwrapped = unwrap(json, res.status);
    if (!res.ok) {
      throw new ApiError("ERROR", res.statusText || "Request failed", res.status);
    }
    return { data: unwrapped.data as T, meta: unwrapped.meta };
  } catch (err) {
    if (!opts.silent) toastApiError(err);
    throw err;
  }
}

export async function apiAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/health/", { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
