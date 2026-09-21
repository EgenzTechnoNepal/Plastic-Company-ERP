import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Users, Layers, Bell, Plus, Shield, CalendarRange, MessageCircle, KeyRound, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/constants/roles";
import { CATEGORIES, TAX_RATES, UNITS } from "@/constants/masters";
import { DEMO_ACCOUNTS, useAuthStore } from "@/store/auth";
import { str } from "@/lib/records";
import { useRecords } from "@/services/entityService";
import { organizationApi, type CompanyDto, type FiscalPeriodDto } from "@/services/api/organization";
import { WorkflowRulesEditor } from "@/features/workflow/WorkflowRulesEditor";

export const Route = createFileRoute("/_app/settings/")({ component: SettingsPage });

const TABS = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "organization", label: "Organization", icon: CalendarRange },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "masters", label: "Masters", icon: Layers },
  { id: "integrations", label: "Integrations", icon: MessageCircle },
  { id: "workflow", label: "Workflow", icon: GitBranch },
  { id: "security", label: "Security", icon: KeyRound },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("company");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company profile, users & permissions, master data and alert preferences"
      />

      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="inline-flex min-w-full gap-1 rounded-lg border bg-card p-1 sm:min-w-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "company" && <CompanyTab />}
      {tab === "organization" && <OrganizationTab />}
      {tab === "users" && <UsersTab />}
      {tab === "masters" && <MastersTab />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "workflow" && <WorkflowTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "notifications" && <NotificationsTab />}
    </div>
  );
}

function CompanyTab() {
  const live = useAuthStore((s) => s.source === "api");
  const qc = useQueryClient();
  const { data: companies = [] } = useQuery({
    queryKey: ["organization", "companies"],
    queryFn: organizationApi.companies,
    enabled: live,
    retry: 1,
  });
  const company = companies[0];
  const [form, setForm] = useState({
    name: "EcoWrap Nepal Pvt. Ltd.",
    pan: "601234567",
    address: "Itahari-13, Nepal",
    currency: "NPR",
    legal: "EcoWrap Nepal Pvt. Ltd.",
  });

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name,
      pan: company.pan_vat_number,
      address: company.address,
      currency: company.base_currency,
      legal: company.legal_name,
    });
  }, [company]);

  const set = (id: keyof typeof form, value: string) => setForm((s) => ({ ...s, [id]: value }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (live && company) {
          try {
            await organizationApi.patchCompany(company.id, {
              name: form.name,
              legal_name: form.legal,
              pan_vat_number: form.pan,
              address: form.address,
              base_currency: form.currency,
            } as Partial<CompanyDto>);
            await qc.invalidateQueries({ queryKey: ["organization", "companies"] });
            toast.success("Company profile saved to the server");
            return;
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save company");
            return;
          }
        }
        toast.success("Company profile saved locally (connect to Django to persist)");
      }}
      className="grid gap-4 lg:grid-cols-3"
    >
      <Card className="rounded-2xl border-border/60 shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Company profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[
            { id: "name" as const, label: "Company name" },
            { id: "legal" as const, label: "Legal name" },
            { id: "pan" as const, label: "PAN / VAT no." },
            { id: "currency" as const, label: "Base currency" },
            { id: "address" as const, label: "Address" },
          ].map((f) => (
            <div key={f.id} className={cn("space-y-2", f.id === "address" && "sm:col-span-2")}>
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input id={f.id} value={form[f.id]} onChange={(e) => set(f.id, e.target.value)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit">Save changes</Button>
            <span className="ml-3 text-xs text-muted-foreground">
              {live ? "Saving to /api/v1/organization/companies/" : "Offline mock — start Django to persist"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center text-center">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">EW</AvatarFallback>
          </Avatar>
          <p className="mt-4 text-sm font-medium">Company logo</p>
          <p className="text-xs text-muted-foreground">PNG or SVG, up to 2 MB</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => toast("Logo upload uses Company.logo on the backend")}>
            Upload logo
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function OrganizationTab() {
  const live = useAuthStore((s) => s.source === "api");
  const qc = useQueryClient();
  const { data: years = [] } = useQuery({
    queryKey: ["organization", "fiscal-years"],
    queryFn: organizationApi.fiscalYears,
    enabled: live,
    retry: 1,
  });
  const { data: periods = [] } = useQuery({
    queryKey: ["organization", "fiscal-periods"],
    queryFn: () => organizationApi.fiscalPeriods(),
    enabled: live,
    retry: 1,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["organization", "branches"],
    queryFn: organizationApi.branches,
    enabled: live,
    retry: 1,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["organization", "departments"],
    queryFn: organizationApi.departments,
    enabled: live,
    retry: 1,
  });

  const togglePeriod = async (p: FiscalPeriodDto, status: FiscalPeriodDto["status"]) => {
    try {
      await organizationApi.patchFiscalPeriod(p.id, { status });
      await qc.invalidateQueries({ queryKey: ["organization", "fiscal-periods"] });
      toast.success(`${p.code} marked ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update period");
    }
  };

  if (!live) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sign in against the Django backend to load branches, departments and fiscal periods from Phase A.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MasterCard
        title="Branches"
        rows={branches.map((b) => ({
          id: b.id,
          primary: b.name,
          secondary: b.code,
          value: b.is_head_office ? "Head office" : "Branch",
        }))}
      />
      <MasterCard
        title="Departments"
        rows={departments.map((d) => ({ id: d.id, primary: d.name, secondary: d.code, value: d.is_active ? "Active" : "Inactive" }))}
      />
      <MasterCard
        title="Fiscal years"
        rows={years.map((y) => ({
          id: y.id,
          primary: y.code,
          secondary: `${y.start_date} → ${y.end_date}`,
          value: y.status,
        }))}
      />
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Fiscal periods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {periods.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.code}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.start_date} → {p.end_date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={p.status === "open" ? "success" : p.status === "locked" ? "danger" : "neutral"}>{p.status}</StatusBadge>
                  {p.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => togglePeriod(p, "closed")}>
                      Close
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => togglePeriod(p, "open")}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab() {
  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Users & permissions</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" asChild>
            <Link to="/settings/permissions">
              <Shield className="h-4 w-4" />
              Permission matrix
            </Link>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => toast("Invite flow connects to backend")}>
            <Plus className="h-4 w-4" />
            Invite
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {DEMO_ACCOUNTS.map((u) => (
          <div
            key={u.id}
            className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                  {u.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">{ROLE_LABELS[u.role as Role] ?? u.role}</StatusBadge>
              <StatusBadge tone="success">active</StatusBadge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MastersTab() {
  const warehouses = useRecords("warehouses");
  const products = useRecords("products");
  const bins = useRecords("bins");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MasterCard
        title="Tax rates"
        rows={TAX_RATES.map((t) => ({ id: t.id, primary: t.name, secondary: t.applies, value: `${t.rate}%` }))}
      />
      <MasterCard
        title="Units of measure"
        rows={UNITS.map((u) => ({ id: u.id, primary: u.name, secondary: "Unit", value: u.code }))}
      />
      <MasterCard
        title="Product categories"
        rows={CATEGORIES.map((c) => ({
          id: c.id,
          primary: c.name,
          secondary: "Category",
          value: `${products.filter((p) => str(p, "type") === c.name || str(p, "category").toLowerCase().includes(c.name.split(" ")[0].toLowerCase())).length} items`,
        }))}
      />
      <MasterCard
        title="Warehouses"
        rows={warehouses.map((w) => ({
          id: w.id,
          primary: w.title,
          secondary: str(w, "location"),
          value: `${bins.filter((b) => str(b, "warehouse") === w.code).length} bins`,
        }))}
      />
    </div>
  );
}

function MasterCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; primary: string; secondary: string; value: string }>;
}) {
  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast(`Add ${title.toLowerCase()} — coming with backend`)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-0">
        {rows.map((r, i) => (
          <div key={r.id}>
            {i > 0 && <Separator />}
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.primary}</p>
                <p className="truncate text-xs text-muted-foreground">{r.secondary}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{r.value}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const templates = useRecords("whatsapp_templates");
  const tags = useRecords("rfid_tags");
  const sensors = useRecords("iot_sensors");
  const backups = useRecords("backups");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Full consoles live under{" "}
        <Link to="/integrations" className="text-primary hover:underline">
          Integrations
        </Link>{" "}
        and{" "}
        <Link to="/ird" className="text-primary hover:underline">
          IRD / CBMS
        </Link>
        . Cards below are a snapshot of local records.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
      <MasterCard
        title="WhatsApp templates"
        rows={templates.map((r) => ({ id: r.id, primary: r.title || r.code, secondary: r.code, value: r.status }))}
      />
      <MasterCard
        title="RFID tags"
        rows={tags.map((r) => ({ id: r.id, primary: r.title || r.code, secondary: r.code, value: r.status }))}
      />
      <MasterCard
        title="IoT sensors"
        rows={sensors.map((r) => ({ id: r.id, primary: r.title || r.code, secondary: r.code, value: r.status }))}
      />
      <MasterCard
        title="Backups"
        rows={backups.map((r) => ({ id: r.id, primary: r.title || r.code, secondary: r.code, value: r.status }))}
      />
      </div>
    </div>
  );
}

function WorkflowTab() {
  return <WorkflowRulesEditor />;
}

function SecurityTab() {
  const live = useAuthStore((s) => s.source === "api");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!live) return;
    import("@/services/api/client")
      .then(({ apiFetch }) => apiFetch<{ enabled: boolean }>("/auth/2fa/", { silent: true }))
      .then((data) => setEnabled(Boolean(data.enabled)))
      .catch(() => undefined);
  }, [live]);

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Privileged roles (administrator, manager, accounting) should enrol an authenticator app. Hardware RFID/IoT
          pairing is configured under Integrations; device purchase is out of contract scope.
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Authenticator app (TOTP)</p>
            <p className="text-xs text-muted-foreground">{live ? "Talks to POST /api/v1/auth/2fa/" : "Requires a live Django session"}</p>
          </div>
          <Switch
            checked={enabled}
            disabled={!live}
            onCheckedChange={async (v) => {
              try {
                const { apiFetch } = await import("@/services/api/client");
                await apiFetch("/auth/2fa/", { method: "POST", body: { enabled: v } });
                setEnabled(v);
                toast.success(v ? "2FA enabled for this account" : "2FA disabled");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not update 2FA");
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const PREFS = [
  { id: "stock", label: "Low stock alerts", hint: "Notify when an item drops below reorder level", on: true },
  { id: "approval", label: "Approval requests", hint: "Quotations, purchase orders and leave requests", on: true },
  { id: "qc", label: "Quality failures", hint: "Failed inspections and quarantine holds", on: true },
  { id: "prod", label: "Production updates", hint: "Order started, completed or delayed", on: false },
  { id: "email", label: "Email digest", hint: "Daily summary at 6:00 PM", on: false },
  { id: "sms", label: "SMS alerts", hint: "High priority events only", on: false },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState(() => Object.fromEntries(PREFS.map((p) => [p.id, p.on])));

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Alert preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {PREFS.map((p, i) => (
          <div key={p.id}>
            {i > 0 && <Separator />}
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.hint}</p>
              </div>
              <Switch
                checked={prefs[p.id]}
                onCheckedChange={(v) => {
                  setPrefs((s) => ({ ...s, [p.id]: v }));
                  toast.success(`${p.label} ${v ? "enabled" : "disabled"}`);
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
