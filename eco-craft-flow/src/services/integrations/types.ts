/** Shared types for stubbed third-party adapters. Django will implement the same surface. */

export type IntegrationStatus = "stub" | "ready";

export class NotImplemented extends Error {
  readonly provider: string;
  constructor(provider: string, action = "call") {
    super(`${provider} is not connected — backend phase (${action}).`);
    this.name = "NotImplemented";
    this.provider = provider;
  }
}

export function integrationStatus(_provider: string): IntegrationStatus {
  return "stub";
}
