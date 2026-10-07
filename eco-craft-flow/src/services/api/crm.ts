/**
 * Phase B — typed CRM + approval API adapters.
 * DomainRecord CRM routes remain for leads/opportunities/quotations.
 */
import { API_V1 } from "./endpoints";
import { apiFetch, apiFetchMeta } from "./client";
import type { DocStatus, ErpRecord } from "@/types/erp";
import type { TypedListQuery } from "./m2Typed";
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
  actor?: string | null;
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
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requested_by?: string | null;
  requested_by_email?: string;
  requested_at: string;
  decided_by?: string | null;
  decided_by_email?: string;
  decided_at?: string | null;
  comments?: string;
  decision_reason?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
      country: row.country,
      notes: row.notes,
      paymentTerms: row.payment_terms,
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
      partyKind: row.party_kind,
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
      name: row.subject,
      type: row.activity_type,
      activityType: row.activity_type,
      description: row.description,
      outcome: row.description,
      customer: row.customer,
      supplier: row.supplier,
      contact: row.contact,
      dueAt: row.due_at,
      dueDate: row.due_at?.slice(0, 10),
      completedAt: row.completed_at,
      owner: row.actor,
      backendStatus: row.status,
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

function cleanQuery(query: TypedListQuery | undefined, allowed: Array<keyof TypedListQuery>) {
  const out: Record<string, string | number | boolean> = { page_size: 200 };
  if (!query) return out;
  for (const key of allowed) {
    const value = query[key];
    if (value !== undefined && value !== "") out[key] = value as string | number | boolean;
  }
  return out;
}

function activityStatusToBackend(value: unknown): string {
  const raw = String(value ?? "OPEN").toUpperCase();
  if (raw === "COMPLETED") return "DONE";
  if (raw === "CANCELLED") return "CANCELLED";
  if (["OPEN", "DONE"].includes(raw)) return raw;
  return "OPEN";
}

async function resolveCustomerRef(ref: unknown): Promise<string | null> {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const hit = (await listTypedCustomers()).find((row) => row.id === raw || row.code === raw || row.title === raw);
  if (!hit) throw new Error(`Customer "${raw}" not found.`);
  return hit.id;
}

async function resolveContactRef(ref: unknown): Promise<string | null> {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const hit = (await listTypedContacts()).find((row) => row.id === raw || row.code === raw || row.title === raw);
  if (!hit) throw new Error(`Contact "${raw}" not found.`);
  return hit.id;
}

async function resolveSupplierRef(ref: unknown): Promise<string | null> {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f-]{32,36}$/i.test(raw)) return raw;
  const { listTypedSuppliers } = await import("./m2Typed");
  const hit = (await listTypedSuppliers()).find((row) => row.id === raw || row.code === raw || row.title === raw);
  if (!hit) throw new Error(`Supplier "${raw}" not found.`);
  return hit.id;
}

export async function listTypedCustomers(query?: TypedListQuery): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<CustomerDto[] | { results: CustomerDto[] }>(CRM_TYPED_API.customers, {
    query: cleanQuery(query, ["company", "search", "is_active", "customer_type"]),
    silent: true,
  });
  return unwrapList<CustomerDto>(data).map(customerToErp);
}

export async function getTypedCustomer(id: string): Promise<ErpRecord> {
  const row = await apiFetch<CustomerDto>(`${CRM_TYPED_API.customers}${id}/`, { silent: true });
  return customerToErp(row);
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
    country: String(f.country || f.city || ""),
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
  if (f.country != null || f.city != null) body.country = f.country ?? f.city;
  if (f.pan != null) body.tax_id = f.pan;
  if (f.creditLimit != null) body.credit_limit = String(f.creditLimit);
  if (f.paymentTerms != null) body.payment_terms = f.paymentTerms;
  if (f.notes != null) body.notes = f.notes;
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

export async function listTypedContacts(query?: TypedListQuery): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<ContactDto[] | { results: ContactDto[] }>(CRM_TYPED_API.contacts, {
    query: cleanQuery(query, ["company", "customer", "supplier", "party_kind", "is_active", "search"]),
    silent: true,
  });
  return unwrapList<ContactDto>(data).map(contactToErp);
}

export async function getTypedContact(id: string): Promise<ErpRecord> {
  const row = await apiFetch<ContactDto>(`${CRM_TYPED_API.contacts}${id}/`, { silent: true });
  return contactToErp(row);
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
    customer: await resolveCustomerRef(f.customer),
    supplier: await resolveSupplierRef(f.supplier),
    party_kind: String(f.partyKind || (f.supplier ? "SUPPLIER" : "CUSTOMER")),
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
  if (f.alternatePhone != null) body.alternate_phone = f.alternatePhone;
  if (f.preferredChannel != null) body.preferred_channel = f.preferredChannel;
  if (f.customer != null) body.customer = await resolveCustomerRef(f.customer);
  if (f.supplier != null) body.supplier = await resolveSupplierRef(f.supplier);
  if (f.partyKind != null) body.party_kind = f.partyKind;
  if (f.isPrimary != null) body.is_primary = Boolean(f.isPrimary);
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

export async function listTypedActivities(query?: TypedListQuery): Promise<ErpRecord[]> {
  const { data } = await apiFetchMeta<ActivityDto[] | { results: ActivityDto[] }>(CRM_TYPED_API.activities, {
    query: cleanQuery(query, ["company", "customer", "supplier", "contact", "activity_type", "status", "search"]),
    silent: true,
  });
  return unwrapList<ActivityDto>(data).map(activityToErp);
}

export async function getTypedActivity(id: string): Promise<ErpRecord> {
  const row = await apiFetch<ActivityDto>(`${CRM_TYPED_API.activities}${id}/`, { silent: true });
  return activityToErp(row);
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
    customer: await resolveCustomerRef(f.customer),
    supplier: await resolveSupplierRef(f.supplier),
    contact: await resolveContactRef(f.contact),
    status: activityStatusToBackend(f.backendStatus || partial.status),
    due_at: f.dueAt || f.dueDate || null,
  };
  const row = await apiFetch<ActivityDto>(CRM_TYPED_API.activities, { method: "POST", body, silent: true });
  return activityToErp(row);
}

export async function updateTypedActivity(id: string, partial: Partial<ErpRecord>): Promise<ErpRecord> {
  const f = partial.fields ?? {};
  const body: Record<string, unknown> = {};
  if (f.subject != null || f.name != null || partial.title != null) body.subject = f.subject ?? f.name ?? partial.title;
  if (f.description != null || f.outcome != null) body.description = f.description ?? f.outcome;
  if (f.type != null || f.activityType != null) body.activity_type = String(f.type ?? f.activityType).toUpperCase();
  if (f.customer != null) body.customer = await resolveCustomerRef(f.customer);
  if (f.supplier != null) body.supplier = await resolveSupplierRef(f.supplier);
  if (f.contact != null) body.contact = await resolveContactRef(f.contact);
  if (f.dueAt != null || f.dueDate != null) body.due_at = f.dueAt ?? f.dueDate;
  if (partial.status != null || f.backendStatus != null) {
    body.status = activityStatusToBackend(f.backendStatus ?? partial.status);
  }
  const row = await apiFetch<ActivityDto>(`${CRM_TYPED_API.activities}${id}/`, {
    method: "PATCH",
    body,
    silent: true,
  });
  return activityToErp(row);
}

export async function listTypedApprovals(query: {
  status?: ApprovalDto["status"];
  search?: string;
} = {}): Promise<ApprovalDto[]> {
  const { data } = await apiFetchMeta<ApprovalDto[] | { results: ApprovalDto[] }>(CRM_TYPED_API.approvals, {
    query: { page_size: 200, ...query },
    silent: true,
  });
  return unwrapList<ApprovalDto>(data);
}

export async function getTypedApproval(id: string): Promise<ApprovalDto> {
  return apiFetch<ApprovalDto>(`${CRM_TYPED_API.approvals}${id}/`, { silent: true });
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
