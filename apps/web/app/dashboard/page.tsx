import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { DashboardFrame } from "../../components/dashboard/dashboard-frame";
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
    <DashboardFrame
      userEmail={session.user.email}
      workspaceLabel="Energon"
      section="Overview"
      title="Control your autonomous company."
      subtitle="Usage, agents and memory in one focused operating view."
      badge="Live"
      nav={[
        { label: "Overview", href: "#overview", icon: "overview", active: true },
        { label: "Agents & keys", href: "#org-agents", icon: "agents" },
        { label: "Memory", href: "#org-memories", icon: "memory" },
        { label: "Dreams", href: "#dreams", icon: "dreams" },
        { label: "Write memory", href: "#memory", icon: "write" },
        { label: "Billing", href: "#billing", icon: "billing" },
        { label: "Advanced", href: "#advanced", icon: "advanced" },
      ]}
    >
      <DashboardConsole userEmail={session.user.email} />
    </DashboardFrame>
  );
}
