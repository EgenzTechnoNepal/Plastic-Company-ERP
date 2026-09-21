import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";

export const Route = createFileRoute("/_app")({
  // Auth + localStorage session — client only (avoids SSR hydrate loops on tunnel).
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  // Auth state lives in localStorage, so it is only available after hydration.
  useEffect(() => {
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setReady(true));
    if (useAuthStore.persist?.hasHydrated?.()) setReady(true);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login", replace: true });
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
