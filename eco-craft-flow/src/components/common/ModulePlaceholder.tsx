import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "./EmptyState";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features: string[];
}

export function ModulePlaceholder({ title, description, icon: Icon, features }: ModulePlaceholderProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Icon}
        title="Module ready to build"
        description="This module is scaffolded and reserved. Full CRUD, tables, filters, exports and forms ship in the next phase."
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f}
            className="rounded-xl border border-border/60 bg-card p-4 text-sm text-card-foreground shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="font-medium">{f}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}