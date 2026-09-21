import { BrandLogo } from "@/components/brand/BrandMark";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-sm">
          <BrandLogo className="h-16 w-auto max-w-[240px]" />
        </div>
        <div className="relative z-10 max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            One system for procurement, production, quality &amp; dispatch.
          </h2>
          <p className="text-sm text-sidebar-foreground/70">
            ISO 17088 compliant traceability from raw compostable film to finished
            packaging batch — with real-time inventory, QC and audit trail.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/60">
          © 2026 EcoWrap Nepal Pvt. Ltd.
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sidebar-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo className="h-14 w-auto max-w-[200px]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
