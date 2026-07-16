import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { site } from "@/lib/site";
import { Toaster } from "@/components/ui/sonner";
import { DashboardAnalytics } from "./dashboard-analytics";
import { DashboardConsole } from "./dashboard-console";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Operate Energon OS agents, private memory overlays, context builds, and audit checks.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const activeOrgId = session.session.activeOrganizationId ?? null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-foreground uppercase"
            aria-label="Energon OS home"
          >
            <span className="size-3.5 bg-foreground" aria-hidden="true" />
            Energon
          </Link>
          <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
            Operator dashboard
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium tracking-tight text-foreground">Memory control plane</h1>
          <p className="text-sm text-muted-foreground">{site.shortClaim}</p>
        </div>

        <DashboardAnalytics orgId={activeOrgId} userId={session.user.id} />
        <DashboardConsole userEmail={session.user.email} />
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </main>
  );
}
