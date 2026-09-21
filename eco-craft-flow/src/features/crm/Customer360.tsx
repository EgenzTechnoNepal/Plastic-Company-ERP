import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { recordPath } from "@/features/registry/paths";
import { npr } from "@/lib/export";
import { num, statusLabel, statusTone, str } from "@/lib/records";
import { recordTotal, useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

function matchesCustomer(row: ErpRecord, customer: ErpRecord) {
  const code = customer.code;
  const name = customer.title;
  return [str(row, "customer"), str(row, "customerName"), row.title].some(
    (v) => v === code || v === name || v.includes(code),
  );
}

function RelatedTable({ title, rows, entity }: { title: string; rows: ErpRecord[]; entity: string }) {
  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {rows.slice(0, 8).map((r) => (
          <Link
            key={r.id}
            to={recordPath(entity, r.code) as never}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
          >
            <span className="min-w-0 truncate">
              <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
              <span className="ml-2">{r.title}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">{npr(recordTotal(r) || num(r, "amount"))}</span>
              <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function Customer360({ customer }: { customer: ErpRecord }) {
  const contacts = useRecords("contacts").filter((r) => matchesCustomer(r, customer));
  const quotes = useRecords("quotations").filter((r) => matchesCustomer(r, customer));
  const orders = useRecords("sales_orders").filter((r) => matchesCustomer(r, customer));
  const invoices = useRecords("invoices").filter((r) => matchesCustomer(r, customer));
  const payments = useRecords("payments").filter((r) => matchesCustomer(r, customer));
  const returns = useRecords("sales_returns").filter((r) => matchesCustomer(r, customer));
  const tickets = useRecords("tickets").filter((r) => matchesCustomer(r, customer));
  const activities = useRecords("activities").filter((r) => matchesCustomer(r, customer));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Credit limit</p>
          <p className="text-lg font-semibold">{npr(num(customer, "creditLimit"))}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-lg font-semibold">{npr(num(customer, "outstanding"))}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Price list</p>
          <p className="text-lg font-semibold">{str(customer, "priceList", "Standard")}</p>
        </div>
      </div>
      <RelatedTable title="Contacts" rows={contacts} entity="contacts" />
      <RelatedTable title="Activities" rows={activities} entity="activities" />
      <RelatedTable title="Quotations" rows={quotes} entity="quotations" />
      <RelatedTable title="Sales orders" rows={orders} entity="sales_orders" />
      <RelatedTable title="Invoices" rows={invoices} entity="invoices" />
      <RelatedTable title="Payments" rows={payments} entity="payments" />
      <RelatedTable title="Returns" rows={returns} entity="sales_returns" />
      <RelatedTable title="Complaints / tickets" rows={tickets} entity="tickets" />
    </div>
  );
}
