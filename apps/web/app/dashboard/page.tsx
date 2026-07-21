import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { site } from "../../lib/site";
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

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-rail" aria-label="Dashboard navigation">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Energon</span>
        </Link>
        <nav>
          <a href="#agents">Set up</a>
          <a href="#billing">Plan</a>
          <a href="#org-agents">Manage agents</a>
          <a href="#org-memories">Saved memory</a>
          <a href="#memory">Save a note</a>
          <a href="#context">Build context</a>
          <a href="#audit">Activity</a>
        </nav>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Agent memory workspace</p>
            <h1>Keep agent memory private. Share it when it helps.</h1>
          </div>
          <p>{site.shortClaim}</p>
        </header>
        <DashboardConsole userEmail={session.user.email} />
      </section>
    </main>
  );
}
