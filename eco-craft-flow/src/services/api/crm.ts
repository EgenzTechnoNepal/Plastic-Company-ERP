/**
 * Phase B — typed CRM + approval API adapters.
 * DomainRecord CRM routes remain for leads/opportunities/quotations.
 */
import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta } from "./client";
import type { DocStatus, ErpRecord } from "@/types/erp";
import { organizationApi } from "./organization";

export const CRM_TYPED_API = {
  customers: `${API_V1}/crm/customer-masters/`,
  contacts: `${API_V1}/crm/contact-masters/`,
  addresses: `${API_V1}/crm/party-addresses/`,
  activities: `${API_V1}/crm/activity-masters/`,
  suppliers: `${API_V1}/purchase/vendors/`,
  approvals: `${API_V1}/workflow/approval-requests/`,
} as const;

export type CustomerDto = {
  id: string;
  company: string;
  code: string;
  legal_name: string;
  trading_name?: string;
  customer_type?: string;
  country?: string;
  address?: string;
  shipping_address?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  tax_id?: string;
  currency?: string | null;
  payment_terms?: string;
  credit_limit?: string | null;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactDto = {
  id: string;
  company: string;
  customer?: string | null;
  supplier?: string | null;
  party_kind?: string;
  name: string;
  designation?: string;
  email?: string;
  phone?: string;
  alternate_phone?: string;
  preferred_channel?: string;
  is_primary?: boolean;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ActivityDto = {
  id: string;
  company: string;
  customer?: string | null;
  supplier?: string | null;
  contact?: string | null;
  activity_type: string;
  subject: string;
  description?: string;
  status: string;
  due_at?: string | null;
  completed_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApprovalDto = {
  id: string;
  company: string;
  module_code: string;
  target_type: string;
  target_id: string;
  document_number: string;
  title: string;
  status: string;
  requested_by?: string | null;
  requested_by_email?: string;
  requested_at: string;
  decided_by?: string | null;
  decided_by_email?: string;
  decided_at?: string | null;
  comments?: string;
  decision_reason?: string;
};

let cachedCompanyId: string | null = null;

export async function resolveDefaultCompanyId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;
  const companies = await organizationApi.companies();
  const active = companies.find((c) => c.is_active) ?? companies[0];
  if (!active) throw new Error("No company available for CRM create.");
  cachedCompanyId = active.id;
  return cachedCompanyId;
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

export function customerToErp(row: CustomerDto): ErpRecord {
  return {
    id: row.id,
    entity: "customers",
    code: row.code,
    title: row.trading_name || row.legal_name,
    date: row.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    status: (row.is_active ? "active" : "inactive") as DocStatus,
    fields: {
      name: row.legal_name,
      type: row.customer_type,
      contactPerson: row.contact_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      shippingAddress: row.shipping_address,
      city: row.country,
      pan: row.tax_id,
      creditLimit: row.credit_limit ? Number(row.credit_limit) : undefined,
      paymentTerms: row.payment_terms,
      website: row.website,
      companyId: row.company,
      typedId: row.id,
    },
    lines: [],
    history: [],
    links: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function contactToErp(row: ContactDto): ErpRecord {
  return {
    id: row.id,
    entity: "contacts",
    code: row.id.slice(0, 8).toUpperCase(),
    title: row.name,
    date: row.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    status: (row.is_active ? "active" : "inactive") as DocStatus,
    fields: {
      name: row.name,
      designation: row.designation,
      email: row.email,
      phone: row.phone,
      alternatePhone: row.alternate_phone,
      preferredChannel: row.preferred_channel,
      customer: row.customer,
      supplier: row.supplier,
      isPrimary: row.is_primary,
      notes: row.notes,
      companyId: row.company,
      typedId: row.id,
    },
    lines: [],
    history: [],
    links: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function activityToErp(row: ActivityDto): ErpRecord {
  const statusMap: Record<string, DocStatus> = {
    OPEN: "open",
    DONE: "completed",
    CANCELLED: "cancelled",
  };
  return {
    id: row.id,
    entity: "activities",
    code: row.id.slice(0, 8).toUpperCase(),
    title: row.subject,
    date: row.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    status: statusMap[row.status] ?? "open",
    fields: {
      subject: row.subject,
      type: row.activity_type,
      description: row.description,
      customer: row.customer,
      supplier: row.supplier,
      contact: row.contact,
      dueAt: row.due_at,
      companyId: row.company,
      typedId: row.id,
    },
    lines: [],
    history: [],
    links: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTypedCustomers(): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<CustomerDto[] | { results: CustomerDto[] }>(CRM_TYPED_API.customers, {
    query: { page_size: 200 },
    silent: true,
  });
  return unwrapList<CustomerDto>(data).map(customerToErp);
}

export async function createTypedCustomer( partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const company = (partial.fields?.companyId as string) || (await resolveDefaultCompanyId());
  const f = partial.fields ?? {};
  const body = {
    company,
    code: partial.code || `CUST-${Date.now().toString(36).toUpperCase()}`,
    legal_name: String(f.name || partial.title || "Customer"),
    trading_name: String(partial.title || f.name || ""),
    customer_type: String(f.type || "CORPORATE").toUpperCase().replace(/\s+/g, "_"),
    contact_name: String(f.contactPerson || ""),
    phone: String(f.phone || ""),
    email: String(f.email || ""),
    address: String(f.address || ""),
    shipping_address: String(f.shippingAddress || ""),
    tax_id: String(f.pan || ""),
    payment_terms: f.creditDays != null ? `${f.creditDays} Days` : String(f.paymentTerms || ""),
    credit_limit: f.creditLimit != null ? String(f.creditLimit) : null,
    website: String(f.website || ""),
    notes: String(f.notes || ""),
    is_active: partial.status !== "inactive",
  };
  const row = await apiFetch<CustomerDto>(CRM_TYPED_API.customers, { method: "POST", body, silent: true });
  return customerToErp(row);
}

export async function updateTypedCustomer(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const f = partial.fields ?? {};
  const body: Record<string, unknown> = {};
  if (f.name != null || partial.title != null) body.legal_name = f.name || partial.title;
  if (partial.title != null) body.trading_name = partial.title;
  if (f.contactPerson != null) body.contact_name = f.contactPerson;
  if (f.phone != null) body.phone = f.phone;
  if (f.email != null) body.email = f.email;
  if (f.address != null) body.address = f.address;
  if (f.shippingAddress != null) body.shipping_address = f.shippingAddress;
  if (f.pan != null) body.tax_id = f.pan;
  if (f.creditLimit != null) body.credit_limit = String(f.creditLimit);
  if (f.website != null) body.website = f.website;
  if (f.type != null) body.customer_type = String(f.type).toUpperCase().replace(/\s+/g, "_");
  if (partial.status === "inactive") body.is_active = false;
  if (partial.status === "active") body.is_active = true;
  const row = await apiFetch<CustomerDto>(`${CRM_TYPED_API.customers}${id}/`, {
    method: "PATCH",
    body,
    silent: true,
  });
  return customerToErp(row);
}

export async function listTypedContacts(): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<ContactDto[] | { results: ContactDto[] }>(CRM_TYPED_API.contacts, {
    query: { page_size: 200 },
    silent: true,
  });
  return unwrapList<ContactDto>(data).map(contactToErp);
}

export async function createTypedContact(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const company = (partial.fields?.companyId as string) || (await resolveDefaultCompanyId());
  const f = partial.fields ?? {};
  const body = {
    company,
    name: String(f.name || partial.title || "Contact"),
    designation: String(f.designation || ""),
    email: String(f.email || ""),
    phone: String(f.phone || ""),
    alternate_phone: String(f.alternatePhone || ""),
    preferred_channel: String(f.preferredChannel || ""),
    customer: f.customer || null,
    supplier: f.supplier || null,
    notes: String(f.notes || ""),
    is_primary: Boolean(f.isPrimary),
  };
  const row = await apiFetch<ContactDto>(CRM_TYPED_API.contacts, { method: "POST", body, silent: true });
  return contactToErp(row);
}

export async function updateTypedContact(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const f = partial.fields ?? {};
  const body: Record<string, unknown> = {};
  if (f.name != null || partial.title != null) body.name = f.name || partial.title;
  if (f.designation != null) body.designation = f.designation;
  if (f.email != null) body.email = f.email;
  if (f.phone != null) body.phone = f.phone;
  if (f.notes != null) body.notes = f.notes;
  if (partial.status === "inactive") body.is_active = false;
  if (partial.status === "active") body.is_active = true;
  const row = await apiFetch<ContactDto>(`${CRM_TYPED_API.contacts}${id}/`, {
    method: "PATCH",
    body,
    silent: true,
  });
  return contactToErp(row);
}

export async function listTypedActivities(): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<ActivityDto[] | { results: ActivityDto[] }>(CRM_TYPED_API.activities, {
    query: { page_size: 200 },
    silent: true,
  });
  return unwrapList<ActivityDto>(data).map(activityToErp);
}

export async function createTypedActivity(partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const company = (partial.fields?.companyId as string) || (await resolveDefaultCompanyId());
  const f = partial.fields ?? {};
  const type = String(f.type || "NOTE").toUpperCase();
  const body = {
    company,
    subject: String(f.subject || partial.title || "Activity"),
    activity_type: ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"].includes(type) ? type : "NOTE",
    description: String(f.description || ""),
    customer: f.customer || null,
    supplier: f.supplier || null,
    contact: f.contact || null,
  };
  const row = await apiFetch<ActivityDto>(CRM_TYPED_API.activities, { method: "POST", body, silent: true });
  return activityToErp(row);
}

export async function listTypedApprovals(status?: string): Promise<ApprovalDto[]> {
  const { data } = await apiFetchMeta<ApprovalDto[] | { results: ApprovalDto[] }>(CRM_TYPED_API.approvals, {
    query: status ? { page_size: 200, status } : { page_size: 200 },
    silent: true,
  });
  return unwrapList<ApprovalDto>(data);
}

export async function decideTypedApproval(
  id: string,
  decision: "approve" | "reject" | "cancel",
  reason = "",
): Promise<ApprovalDto> {
  return apiFetch<ApprovalDto>(`${CRM_TYPED_API.approvals}${id}/${decision}/`, {
    method: "POST",
    body: { reason },
    silent: true,
  });
}
