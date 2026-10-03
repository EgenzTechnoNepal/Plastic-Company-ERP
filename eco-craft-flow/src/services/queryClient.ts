import type { QueryClient } from "@tanstack/react-query";

let active: QueryClient | null = null;

export function setActiveQueryClient(client: QueryClient): void {
  active = client;
}

/** Refetch server-backed views after a live mutation. No-op before the router mounts. */
export function invalidateLive(...keys: unknown[][]): void {
  if (!active) return;
  for (const queryKey of keys) void active.invalidateQueries({ queryKey });
}
