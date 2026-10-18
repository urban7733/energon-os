"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Database, RadioTower, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type UsageRoute = {
  route: string;
  calls: number;
  paid_calls: number;
  amount_usdc_micro: number;
};

type ScopeCount = {
  scope: string;
  count: number;
};

type ContextAuditData = {
  allowed_memory_ids: string[];
  denied_memory_count: number;
  estimated_tokens: number;
  token_budget: number;
} | null;

type OutboxStatus = {
  storage: "memory" | "postgres";
  pending: number;
  leased: number;
  published: number;
  retrying: number;
} | null;

type LifecycleItem = readonly [string, boolean, string];

type AnalyticsDeckProps = {
  usage: UsageRoute[];
  scopes: ScopeCount[];
  totalMemories: number;
  agentCount: number;
  contextAudit: ContextAuditData;
  outbox: OutboxStatus;
  lifecycle: readonly LifecycleItem[];
  demo?: boolean;
};

const scopeColors: Record<string, string> = {
  agent_private: "#b7a6ff",
  user_private: "#9d8cf0",
  session: "#7d70c9",
  project: "#9bdcff",
  role: "#84e3c0",
  org: "#c7ecff",
  open: "#ffffff",
};
const fallbackColors = ["#9bdcff", "#b7a6ff", "#84e3c0", "#c7ecff", "#ffcf8a", "#7d8691"];
const tooltipStyle = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(12,14,18,0.96)",
  boxShadow: "0 20px 40px -12px rgba(0,0,0,0.8)",
  color: "#f5f7fa",
  fontSize: 12,
  padding: "8px 12px",
};

type UsageMetric = "calls" | "paid" | "usdc";

export function AnalyticsDeck({
  usage,
  scopes,
  totalMemories,
  agentCount,
  contextAudit,
  outbox,
  lifecycle,
  demo = false,
}: AnalyticsDeckProps) {
  const [usageMetric, setUsageMetric] = useState<UsageMetric>("calls");
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const totalCalls = usage.reduce((total, route) => total + route.calls, 0);
  const paidCalls = usage.reduce((total, route) => total + route.paid_calls, 0);
  const paidUsdcMicro = usage.reduce((total, route) => total + route.amount_usdc_micro, 0);
  const privateMemories = scopes
    .filter(({ scope }) => ["agent_private", "user_private", "session"].includes(scope))
    .reduce((total, { count }) => total + count, 0);
  const sharedMemories = Math.max(0, totalMemories - privateMemories);
  const auditTotal = contextAudit
    ? contextAudit.allowed_memory_ids.length + contextAudit.denied_memory_count
    : 0;
  const approvedRate = auditTotal
    ? Math.round((contextAudit!.allowed_memory_ids.length / auditTotal) * 100)
    : null;
  const eventTotal = outbox ? outbox.pending + outbox.leased + outbox.published : 0;
  const eventDeliveryRate = eventTotal > 0 && outbox
    ? Math.round((outbox.published / eventTotal) * 100)
    : null;

  const usageData = usage.map((route) => ({
    route: route.route.replace("/v1/", ""),
    calls: route.calls,
    paid: route.paid_calls,
    usdc: route.amount_usdc_micro / 1_000_000,
  }));
  const sortedUsageData = [...usageData].sort((a, b) => b[usageMetric] - a[usageMetric]);
  const activeRoute = sortedUsageData.find((route) => route.route === selectedRoute) ?? sortedUsageData[0];
  const scopeData = scopes.map((scope, index) => ({
    key: scope.scope,
    name: scope.scope.replaceAll("_", " "),
    value: scope.count,
    color: scopeColors[scope.scope] ?? fallbackColors[index % fallbackColors.length],
  }));
  const scopeTotal = scopeData.reduce((total, scope) => total + scope.value, 0);

  return (
    <section id="overview" className="dx-analytics" aria-labelledby="analytics-title">
      <h2 id="analytics-title" className="dx-visually-hidden">
        {demo ? "Sample workspace analytics" : "Live workspace analytics"}
      </h2>

      <div className="dx-kpis">
        <Kpi label="API operations" value={totalCalls.toLocaleString()} foot={`${paidCalls.toLocaleString()} metered`}>
          <Meter value={totalCalls ? paidCalls / totalCalls : 0} />
        </Kpi>
        <Kpi
          label="Memory records"
          value={totalMemories.toLocaleString()}
          foot={`${privateMemories.toLocaleString()} private · ${sharedMemories.toLocaleString()} shared`}
        >
          <Meter value={totalMemories ? privateMemories / totalMemories : 0} tone="violet" />
        </Kpi>
        <Kpi label="Active agents" value={agentCount.toLocaleString()} foot="registered identities">
          <span className="dx-kpi-dots" aria-hidden="true">
            {Array.from({ length: Math.min(agentCount, 16) }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </Kpi>
        <Kpi label="USDC settled" value={formatUsdcValue(paidUsdcMicro)} unit="USDC" foot="from recorded paid actions" />
        <Kpi
          label="Event delivery"
          value={eventDeliveryRate === null ? "—" : `${eventDeliveryRate}%`}
          foot={outbox ? `${outbox.pending} pending · ${outbox.retrying} retrying` : "awaiting durable storage"}
        >
          <Ring value={eventDeliveryRate === null ? 0 : eventDeliveryRate / 100} />
        </Kpi>
      </div>

      <Tabs defaultValue="usage" className="dx-tabs">
        <TabsList aria-label="Analytics views">
          <TabsTrigger value="usage">
            <BarChart3 size={14} aria-hidden="true" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Database size={14} aria-hidden="true" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ShieldCheck size={14} aria-hidden="true" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="dx-tab-grid">
          <article className="dx-card dx-chart">
            <header className="dx-card-head">
              <div>
                <h3>Usage by route</h3>
                <p>Select a metric, then inspect any route.</p>
              </div>
              <div className="dx-segment" role="group" aria-label="Usage metric">
                {(["calls", "paid", "usdc"] as const).map((metric) => (
                  <button
                    type="button"
                    key={metric}
                    aria-pressed={usageMetric === metric}
                    onClick={() => setUsageMetric(metric)}
                  >
                    {metric === "calls" ? "Calls" : metric === "paid" ? "Metered" : "USDC"}
                  </button>
                ))}
              </div>
            </header>
            {sortedUsageData.length > 0 ? (
              <div className="dx-chart-frame" aria-label="API request volume by route">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={sortedUsageData} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dx-bar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#9bdcff" stopOpacity={0.35} />
                        <stop offset="1" stopColor="#c7ecff" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#5b636e"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      allowDecimals={usageMetric === "usdc"}
                    />
                    <YAxis
                      type="category"
                      dataKey="route"
                      width={120}
                      stroke="#9aa1ab"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      formatter={(value) => formatUsageMetric(Number(value), usageMetric)}
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: "#c7ecff" }}
                      labelStyle={{ color: "#9aa1ab", marginBottom: 4 }}
                    />
                    <Bar
                      dataKey={usageMetric}
                      name={usageMetric === "calls" ? "Calls" : usageMetric === "paid" ? "Metered calls" : "USDC"}
                      radius={[0, 6, 6, 0]}
                      barSize={14}
                    >
                      {sortedUsageData.map((route) => (
                        <Cell
                          key={route.route}
                          fill="url(#dx-bar)"
                          fillOpacity={!selectedRoute || selectedRoute === route.route ? 1 : 0.3}
                          onClick={() => setSelectedRoute(route.route)}
                          className="dx-bar-cell"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyAnalytics message="No API operations have been recorded for this workspace." />
            )}
          </article>
          <article className="dx-card dx-aside">
            <span className="dx-aside-icon">
              <RadioTower size={16} aria-hidden="true" />
            </span>
            <span className="dx-label">Selected route</span>
            <strong className="dx-aside-title">{activeRoute?.route ?? "No traffic"}</strong>
            {activeRoute ? (
              <dl className="dx-stats">
                <div>
                  <dt>Calls</dt>
                  <dd>{activeRoute.calls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Metered</dt>
                  <dd>{activeRoute.paid.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Settled</dt>
                  <dd>{formatUsdc(activeRoute.usdc * 1_000_000)}</dd>
                </div>
              </dl>
            ) : (
              <p className="dx-muted">Route details appear after the first API operation.</p>
            )}
          </article>
        </TabsContent>

        <TabsContent value="memory" className="dx-tab-grid">
          <article className="dx-card dx-chart">
            <header className="dx-card-head">
              <div>
                <h3>Memory distribution</h3>
                <p>Every record is counted in the scope where it can be read.</p>
              </div>
            </header>
            {scopeData.length > 0 ? (
              <div className="dx-donut-layout">
                <div className="dx-donut" aria-label="Memory distribution by scope">
                    <PieChart width={240} height={240}>
                      <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#f5f7fa" }} />
                      <Pie
                        data={scopeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={86}
                        outerRadius={116}
                        paddingAngle={2}
                        cornerRadius={4}
                        stroke="none"
                      >
                        {scopeData.map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  <div className="dx-donut-center">
                    <strong>{totalMemories.toLocaleString()}</strong>
                    <span>records</span>
                  </div>
                </div>
                <ul className="dx-legend">
                  {scopeData.map((entry) => (
                    <li key={entry.key}>
                      <i style={{ background: entry.color }} />
                      <span>{entry.name}</span>
                      <em>{entry.value.toLocaleString()}</em>
                      <b>{scopeTotal ? Math.round((entry.value / scopeTotal) * 100) : 0}%</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyAnalytics message="Memory scope analytics appear after an agent saves its first note." />
            )}
          </article>
          <article className="dx-card dx-aside">
            <span className="dx-aside-icon">
              <Database size={16} aria-hidden="true" />
            </span>
            <span className="dx-label">Private by default</span>
            <strong className="dx-aside-figure">{privateMemories.toLocaleString()}</strong>
            <p className="dx-muted">Private records stay isolated until an agent explicitly promotes them.</p>
          </article>
        </TabsContent>

        <TabsContent value="audit" className="dx-tab-grid">
          <article className="dx-card dx-chart">
            <header className="dx-card-head">
              <div>
                <h3>Latest context decision</h3>
                <p>Permission evaluation from the most recently inspected context request.</p>
              </div>
              {approvedRate === null ? null : <span className="dx-pill dx-pill-ok">{approvedRate}% allowed</span>}
            </header>
            {contextAudit ? (
              <div className="dx-audit">
                <div>
                  <span className="dx-label">Allowed</span>
                  <strong>{contextAudit.allowed_memory_ids.length}</strong>
                  <p>records released to the agent</p>
                </div>
                <div>
                  <span className="dx-label">Denied</span>
                  <strong>{contextAudit.denied_memory_count}</strong>
                  <p>records kept outside the pack</p>
                </div>
                <div>
                  <span className="dx-label">Token budget</span>
                  <strong>{contextAudit.estimated_tokens.toLocaleString()}</strong>
                  <p>of {contextAudit.token_budget.toLocaleString()} tokens</p>
                  <Meter value={contextAudit.token_budget ? contextAudit.estimated_tokens / contextAudit.token_budget : 0} />
                </div>
              </div>
            ) : (
              <EmptyAnalytics message="Build a context pack and inspect its audit record to see real permission outcomes." />
            )}
          </article>
          <article className="dx-card dx-aside">
            <span className="dx-label">Workspace readiness</span>
            <ul className="dx-checklist">
              {lifecycle.map(([label, complete, detail]) => (
                <li key={label} className={complete ? "is-done" : ""}>
                  <i aria-hidden="true" />
                  <span>{label}</span>
                  <em>{detail}</em>
                </li>
              ))}
            </ul>
          </article>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Kpi({
  label,
  value,
  unit,
  foot,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  foot: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="dx-kpi">
      <span className="dx-label">{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <div className="dx-kpi-foot">
        <p>{foot}</p>
        {children}
      </div>
    </article>
  );
}

function Meter({ value, tone = "ice" }: { value: number; tone?: "ice" | "violet" }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span className={`dx-meter dx-meter-${tone}`} aria-hidden="true">
      <span style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}

function Ring({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 9;
  return (
    <svg className="dx-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="9" strokeDasharray={`${circumference * value} ${circumference}`} />
    </svg>
  );
}

function EmptyAnalytics({ message }: { message: string }) {
  return <p className="dx-empty">{message}</p>;
}

function formatUsdcValue(microUsdc: number) {
  return (microUsdc / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsdc(microUsdc: number) {
  return `${(microUsdc / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}

function formatUsageMetric(value: number, metric: UsageMetric) {
  if (metric === "usdc") return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
  return value.toLocaleString();
}
