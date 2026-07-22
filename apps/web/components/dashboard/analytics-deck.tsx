"use client";

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
import { Activity, BarChart3, BrainCircuit, Database, ShieldCheck } from "lucide-react";
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

type LifecycleItem = readonly [string, boolean, string];

type AnalyticsDeckProps = {
  usage: UsageRoute[];
  scopes: ScopeCount[];
  totalMemories: number;
  agentCount: number;
  contextAudit: ContextAuditData;
  lifecycle: readonly LifecycleItem[];
};

const chartColors = ["#7dd3fc", "#c4b5fd", "#e5e7eb", "#94a3b8", "#67e8f9", "#ddd6fe"];

export function AnalyticsDeck({
  usage,
  scopes,
  totalMemories,
  agentCount,
  contextAudit,
  lifecycle,
}: AnalyticsDeckProps) {
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

  const usageData = usage.map((route) => ({
    route: route.route.replace("/v1/", ""),
    calls: route.calls,
    paid: route.paid_calls,
  }));
  const scopeData = scopes.map((scope) => ({
    name: scope.scope.replaceAll("_", " "),
    value: scope.count,
  }));

  return (
    <section id="overview" className="analytics-deck" aria-labelledby="analytics-title">
      <div className="analytics-deck-heading">
        <div>
          <p className="dashboard-eyebrow">Live analytics</p>
          <h2 id="analytics-title">Understand how the swarm uses memory.</h2>
        </div>
        <span className="status-pill">
          <Activity size={14} aria-hidden="true" />
          live workspace data
        </span>
      </div>

      <div className="analytics-kpis">
        <article>
          <span>API operations</span>
          <strong>{totalCalls.toLocaleString()}</strong>
          <p>{paidCalls.toLocaleString()} metered request(s)</p>
        </article>
        <article>
          <span>Memory records</span>
          <strong>{totalMemories.toLocaleString()}</strong>
          <p>{privateMemories} private · {sharedMemories} shared</p>
        </article>
        <article>
          <span>Active agents</span>
          <strong>{agentCount.toLocaleString()}</strong>
          <p>registered in this workspace</p>
        </article>
        <article>
          <span>USDC settled</span>
          <strong>{formatUsdc(paidUsdcMicro)}</strong>
          <p>from recorded paid actions</p>
        </article>
      </div>

      <div className="analytics-tabs">
        <Tabs defaultValue="usage">
          <TabsList aria-label="Analytics views">
            <TabsTrigger value="usage">
              <BarChart3 size={15} aria-hidden="true" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="memory">
              <Database size={15} aria-hidden="true" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="audit">
              <ShieldCheck size={15} aria-hidden="true" />
              Audit
            </TabsTrigger>
          </TabsList>

        <TabsContent value="usage" className="analytics-tab-content">
          <article className="analytics-chart analytics-chart-wide">
            <div className="analytics-chart-header">
              <div>
                <span>Request volume</span>
                <p>Calls recorded by API route.</p>
              </div>
              <strong>{totalCalls.toLocaleString()} calls</strong>
            </div>
            {usageData.length > 0 ? (
              <div className="recharts-frame" aria-label="API request volume by route">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#2c2c31" vertical={false} />
                    <XAxis dataKey="route" stroke="#82828c" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis stroke="#82828c" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={{
                        border: "1px solid #37373f",
                        borderRadius: 8,
                        background: "#17171c",
                        color: "#f4f4f5",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="calls" name="API calls" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="paid" name="Metered calls" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyAnalytics message="No API operations have been recorded for this workspace." />
            )}
          </article>
          <article className="analytics-aside">
            <div className="analytics-aside-icon"><BrainCircuit size={18} aria-hidden="true" /></div>
            <span>Cost visibility</span>
            <strong>{formatUsdc(paidUsdcMicro)}</strong>
            <p>Paid API actions are settled before a context pack is returned.</p>
          </article>
        </TabsContent>

        <TabsContent value="memory" className="analytics-tab-content">
          <article className="analytics-chart analytics-chart-wide">
            <div className="analytics-chart-header">
              <div>
                <span>Memory distribution</span>
                <p>Every note is counted in the scope where it can be read.</p>
              </div>
              <strong>{totalMemories.toLocaleString()} records</strong>
            </div>
            {scopeData.length > 0 ? (
              <div className="memory-chart-layout">
                <div className="recharts-frame memory-pie" aria-label="Memory distribution by scope">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={{
                          border: "1px solid #37373f",
                          borderRadius: 8,
                          background: "#17171c",
                          color: "#f4f4f5",
                          fontSize: 12,
                        }}
                      />
                      <Pie
                        data={scopeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={78}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {scopeData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="scope-legend">
                  {scopeData.map((entry, index) => (
                    <div key={entry.name}>
                      <span style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                      <strong>{entry.name}</strong>
                      <em>{entry.value}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyAnalytics message="Memory scope analytics appear after an agent saves its first note." />
            )}
          </article>
          <article className="analytics-aside">
            <div className="analytics-aside-icon"><Database size={18} aria-hidden="true" /></div>
            <span>Private by default</span>
            <strong>{privateMemories}</strong>
            <p>Private records remain isolated until you explicitly promote them.</p>
          </article>
        </TabsContent>

        <TabsContent value="audit" className="analytics-tab-content">
          <article className="analytics-chart analytics-chart-wide audit-summary">
            <div className="analytics-chart-header">
              <div>
                <span>Latest context decision</span>
                <p>Permission evaluation from the most recently inspected context request.</p>
              </div>
              <strong>{approvedRate === null ? "No audit yet" : `${approvedRate}% allowed`}</strong>
            </div>
            {contextAudit ? (
              <div className="audit-analytics-grid">
                <div>
                  <span>Allowed</span>
                  <strong>{contextAudit.allowed_memory_ids.length}</strong>
                  <p>memory record(s) released to the agent</p>
                </div>
                <div>
                  <span>Denied</span>
                  <strong>{contextAudit.denied_memory_count}</strong>
                  <p>memory record(s) kept outside the context pack</p>
                </div>
                <div>
                  <span>Token budget</span>
                  <strong>{contextAudit.estimated_tokens.toLocaleString()}</strong>
                  <p>of {contextAudit.token_budget.toLocaleString()} tokens selected</p>
                </div>
              </div>
            ) : (
              <EmptyAnalytics message="Build a context pack and inspect its audit record to see real permission outcomes." />
            )}
          </article>
          <article className="analytics-aside readiness-aside">
            <span>Workspace readiness</span>
            <div className="readiness-list">
              {lifecycle.map(([label, complete]) => (
                <div key={label}>
                  <i className={complete ? "ready" : ""} />
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
          </article>
        </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function EmptyAnalytics({ message }: { message: string }) {
  return <p className="analytics-empty">{message}</p>;
}

function formatUsdc(microUsdc: number) {
  const value = microUsdc / 1_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}
