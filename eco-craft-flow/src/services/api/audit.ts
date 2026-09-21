import { apiFetchMeta } from "./client";
import type { AuditEvent } from "@/types/erp";

export interface AuditLogDto {
  id: string;
  timestamp: string;
  user: string | null;
  user_email: string;
  action: string;
  module: string;
  model_name: string;
  object_id: string;
  document_number: string;
  request_id: string;
  ip_address: string | null;
  user_agent: string;
  before_data: unknown;
  after_data: unknown;
  reason: string;
}

export function mapAuditLog(row: AuditLogDto): AuditEvent {
  return {
    id: row.id,
    at: row.timestamp,
    user: row.user_email || "system",
    role: "",
    action: row.action,
    module: row.module,
    entity: row.model_name,
    recordId: row.object_id || undefined,
    recordCode: row.document_number || undefined,
    ip: row.ip_address ?? "—",
    before: row.before_data,
    after: row.after_data,
    reason: row.reason || undefined,
  };
}

export async function fetchAuditLogs(query?: {
  search?: string;
  module?: string;
  action?: string;
}): Promise<AuditEvent[]> {
  const { data } = await apiFetchMeta<AuditLogDto[]>("/audit/logs/", {
    query: { page_size: 200, ...query },
    silent: true,
  });
  return (Array.isArray(data) ? data : []).map(mapAuditLog);
}
