import { createFileRoute } from "@tanstack/react-router";
import { Users, Target, FileText, Handshake, Contact, Briefcase, CalendarClock, MapPin, LifeBuoy } from "lucide-react";
import { ModuleTabsLayout, type ModuleTab } from "@/components/layout/ModuleTabsLayout";

export const Route = createFileRoute("/_app/crm")({
  component: CrmLayout,
});

const TABS: readonly ModuleTab[] = [
  { to: "/crm/customers", label: "Customers", icon: Users, formKey: "customer", formLabel: "New Customer" },
  { to: "/crm/contacts", label: "Contacts", icon: Contact, formKey: "contact", formLabel: "New Contact" },
  { to: "/crm/leads", label: "Leads", icon: Target, formKey: "lead", formLabel: "New Lead" },
  { to: "/crm/opportunities", label: "Opportunities", icon: Briefcase, formKey: "opportunity", formLabel: "New Opportunity" },
  { to: "/crm/activities", label: "Activities", icon: CalendarClock, formKey: "activity", formLabel: "New Activity" },
  { to: "/crm/territories", label: "Territories", icon: MapPin, formKey: "territory", formLabel: "New Territory" },
  { to: "/crm/dealers", label: "Dealers", icon: Handshake, formKey: "dealer", formLabel: "New Partner" },
  { to: "/crm/tickets", label: "Tickets", icon: LifeBuoy, formKey: "ticket", formLabel: "New Ticket" },
  { to: "/crm/quotations", label: "Quotations", icon: FileText, formKey: "quotation", formLabel: "New Quotation" },
];

function CrmLayout() {
  return (
    <ModuleTabsLayout
      title="CRM"
      description="Customers 360, pipeline, partners and after-sales tickets"
      tabs={TABS}
    />
  );
}
