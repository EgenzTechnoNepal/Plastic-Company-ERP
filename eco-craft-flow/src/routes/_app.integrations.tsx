import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Landmark, Mail, Radio, Cpu, ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/integrations")({ component: IntegrationsLayout });

const TABS = [
  { to: "/integrations/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/integrations/banking", label: "Banking", icon: Landmark },
  { to: "/integrations/email", label: "Email / Resend", icon: Mail },
  { to: "/integrations/rfid", label: "RFID", icon: Radio },
  { to: "/integrations/iot", label: "IoT", icon: Cpu },
  { to: "/integrations/barcode", label: "Barcode", icon: ScanBarcode },
] as const;

function IntegrationsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Provider consoles for WhatsApp, banking, email, RFID, IoT and barcode. Live engines wait for Django."
      />
      <div className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="inline-flex min-w-full gap-1 rounded-lg border bg-card p-1 sm:min-w-0">
          {TABS.map((tab) => {
            const isActive = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
