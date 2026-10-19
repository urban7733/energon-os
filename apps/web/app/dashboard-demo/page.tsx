import type { Metadata } from "next";
import { DashboardDemo } from "./dashboard-demo";

export const metadata: Metadata = {
  title: "Dashboard Demo",
  description: "Sample Energon OS workspace data for product previews.",
  robots: { index: false, follow: false },
};

export default async function DashboardDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <DashboardDemo view={view === "graph" || view === "agents" || view === "records" || view === "dreams" || view === "billing" ? view : "overview"} />;
}
