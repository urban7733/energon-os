"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Coins,
  Database,
  Eye,
  FileSearch,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  PackageCheck,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { authClient, fetchApiToken } from "../../lib/auth-client";
import { site } from "../../lib/site";
import { BillingCheckout } from "./billing-checkout";

type ApiResult = {
  label: string;
  body: unknown;
};

type MemoryScope =
  | "open"
  | "org"
  | "project"
  | "role"
  | "agent_private"
  | "user_private"
  | "session";
type SharedMemoryScope = "open" | "org" | "project" | "role";

type AgentKeyMetadata = {
  api_key_id: string;
  created_at_unix_ms: number;
  revoked_at_unix_ms: number | null;
};

type OrgAgent = {
  agent_id: string;
  name: string;
  role_id: string | null;
  project_id: string | null;
  created_at_unix_ms: number;
  keys: AgentKeyMetadata[];
};

type OrgMemory = {
  memory_id: string;
  scope: MemoryScope;
  content_preview: string;
  tags: string[];
  project_id: string | null;
  role_id: string | null;
  owner_agent_id: string | null;
  created_at_unix_ms: number;
};

type ApiHealth = {
  status: "ok" | "degraded";
  storage: "memory" | "postgres";
  database: "none" | "connected" | "unavailable";
};

type RouteUsage = {
  route: string;
  calls: number;
  paid_calls: number;
  amount_usdc_micro: number;
};

type UsageSummary = {
  storage: "memory" | "postgres";
  totals: RouteUsage[];
};

type MemoryStats = {
  total_memories: number;
  scopes: Array<{ scope: MemoryScope; count: number }>;
};

type ContextAudit = {
  request_id: string;
  allowed_memory_ids: string[];
  denied_memory_count: number;
  estimated_tokens: number;
  token_budget: number;
};

type PromotionAudit = {
  promotion_id: string;
  source_memory_id: string;
  promoted_memory_id: string;
  target_scope: SharedMemoryScope;
  reason: string;
};

export function DashboardConsole({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  const [apiBaseUrl, setApiBaseUrl] = useState(site.apiBaseUrl);
  const [agentApiKey, setAgentApiKey] = useState("");
  const [agentId, setAgentId] = useState("");
  const [roleId, setRoleId] = useState("strategist");
  const [projectId, setProjectId] = useState("apex_verify");
  const [newOrgName, setNewOrgName] = useState("");
  const [scope, setScope] = useState<MemoryScope>("agent_private");
  const [memoryId, setMemoryId] = useState("");
  const [promotedMemoryId, setPromotedMemoryId] = useState("");
  const [promotionTargetScope, setPromotionTargetScope] = useState<SharedMemoryScope>("project");
  const [promotionReason, setPromotionReason] = useState(
    "Approved for shared investor positioning.",
  );
  const [memory, setMemory] = useState(
    "Do not position Apex Verify as just another social app. Investor outreach should frame it as trust infrastructure.",
  );
  const [task, setTask] = useState("prepare investor outreach");
  const [requestId, setRequestId] = useState("");
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [orgMemories, setOrgMemories] = useState<OrgMemory[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [contextAudit, setContextAudit] = useState<ContextAudit | null>(null);
  const [promotionAudit, setPromotionAudit] = useState<PromotionAudit | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [memoryScopeFilter, setMemoryScopeFilter] = useState<"" | MemoryScope>("");
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult>({
    label: "Ready",
    body: {
      status: "Waiting for an action",
      apiBaseUrl: site.apiBaseUrl,
    },
  });
  const [apiStatus, setApiStatus] = useState<"unchecked" | "online" | "offline">("unchecked");
  const [x402Status, setX402Status] = useState<"unchecked" | "enabled" | "disabled" | "offline">(
    "unchecked",
  );
  const [busy, setBusy] = useState(false);

  const cleanBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);
  const orgId = activeOrganization?.id ?? "";
  const hasAgentApiKey = Boolean(agentApiKey.trim());
  const authMode = hasAgentApiKey ? "Bearer API key" : "Create or rotate an agent key";
  const lifecycle = [
    ["API health", health?.status === "ok", health?.database ?? apiStatus],
    ["Organization", Boolean(orgId), activeOrganization?.name ?? "no active org"],
    ["Registered agents", orgAgents.length > 0, `${orgAgents.length} registered`],
    ["Private memory", Boolean(memoryId), memoryId || "not written"],
    ["Promotion", Boolean(promotedMemoryId), promotedMemoryId || "not promoted"],
    ["Context audit", Boolean(contextAudit), contextAudit?.request_id ?? "not read"],
  ] as const;
  const usageRows = usageSummary?.totals ?? [];
  const maxUsageCalls = Math.max(1, ...usageRows.map((entry) => entry.calls));
  const scopeRows = memoryStats?.scopes ?? [];
  const maxScopeCount = Math.max(1, ...scopeRows.map((entry) => entry.count));
  const auditRows: Array<[string, number]> = contextAudit
    ? [
        ["allowed", contextAudit.allowed_memory_ids.length],
        ["denied", contextAudit.denied_memory_count],
      ]
    : [];
  const maxAuditCount = Math.max(1, ...auditRows.map(([, count]) => count));

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const body = await action();
      setResult({ label, body });
      if (isContextPack(body)) {
        setRequestId(body.request_id);
      }
    } catch (error) {
      setResult({
        label: `${label} failed`,
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function managementFetch(path: string, init?: RequestInit): Promise<unknown> {
    const token = await fetchApiToken();
    const response = await fetch(`${cleanBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  }

  async function requestHealth(): Promise<ApiHealth> {
    const response = await fetch(`${cleanBaseUrl}/health`);
    const body: unknown = await response.json();
    if (!response.ok || !isApiHealth(body)) throw new Error(JSON.stringify(body));
    return body;
  }

  async function requestX402Status(): Promise<boolean> {
    const response = await fetch(`${cleanBaseUrl}/v1/billing/x402`);
    const body: unknown = await response.json();
    if (!response.ok || !isX402Status(body)) throw new Error(JSON.stringify(body));
    return body.enabled;
  }

  async function refreshUsage() {
    const org = requireOrg();
    const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/usage`);
    if (!isUsageSummary(body)) throw new Error("Usage response was invalid.");
    setUsageSummary(body);
    return body;
  }

  async function refreshMemoryStats() {
    const org = requireOrg();
    const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/memory-stats`);
    if (!isMemoryStats(body)) throw new Error("Memory stats response was invalid.");
    setMemoryStats(body);
    return body;
  }

  async function refreshOperationalData() {
    await Promise.all([refreshAgents(), refreshOrgMemories(), refreshUsage(), refreshMemoryStats()]);
  }

  useEffect(() => {
    let current = true;

    async function refreshServiceStatus() {
      try {
        const healthResponse = await requestHealth();
        if (!current) return;
        setHealth(healthResponse);
        setApiStatus(healthResponse.status === "ok" ? "online" : "offline");
      } catch {
        if (!current) return;
        setHealth(null);
        setApiStatus("offline");
      }

      try {
        const enabled = await requestX402Status();
        if (current) setX402Status(enabled ? "enabled" : "disabled");
      } catch {
        if (current) setX402Status("offline");
      }
    }

    void refreshServiceStatus();
    return () => {
      current = false;
    };
  }, [cleanBaseUrl]);

  useEffect(() => {
    let current = true;

    if (!orgId) {
      setOrgAgents([]);
      setOrgMemories([]);
      setMemoryStats(null);
      setUsageSummary(null);
      setContextAudit(null);
      setPromotionAudit(null);
      return () => {
        current = false;
      };
    }

    async function refreshOrganizationData() {
      try {
        await refreshOperationalData();
      } catch {
        // The API status tile already reports availability. Leave the last
        // successful operator data visible while a refresh is unavailable.
        if (!current) return;
      }
    }

    void refreshOrganizationData();
    return () => {
      current = false;
    };
  }, [cleanBaseUrl, memoryScopeFilter, orgId]);

  useEffect(() => {
    if (!orgId) return;
    setAgentId(`agent_${orgId.replace(/[^a-z0-9]/gi, "").slice(-12)}`);
    setAgentApiKey("");
    setMintedKey(null);
    setMemoryId("");
    setPromotedMemoryId("");
    setContextAudit(null);
    setPromotionAudit(null);
  }, [orgId]);

  function requireOrg(): string {
    if (!orgId) {
      throw new Error("Create or select an organization first.");
    }
    return orgId;
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Created organization", async () => {
      const name = newOrgName.trim();
      if (!name) throw new Error("Organization name is required.");
      const slug = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
      const created = await authClient.organization.create({ name, slug });
      if (created.error) throw new Error(created.error.message ?? "Organization create failed");
      await authClient.organization.setActive({ organizationId: created.data.id });
      setNewOrgName("");
      return { organization_id: created.data.id, name, slug };
    });
  }

  async function setActiveOrganization(organizationId: string) {
    if (!organizationId) return;
    await run("Switched organization", async () => {
      const outcome = await authClient.organization.setActive({ organizationId });
      if (outcome.error) throw new Error(outcome.error.message ?? "Failed to switch org");
      setAgentApiKey("");
      setMintedKey(null);
      return { active_organization_id: organizationId };
    });
  }

  async function checkHealth(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await run("API health", async () => {
      const body = await requestHealth();
      setHealth(body);
      setApiStatus(body.status === "ok" ? "online" : "offline");
      return body;
    });
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Created agent", async () => {
      const org = requireOrg();
      const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/agents`, {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          role_id: roleId || null,
          project_id: projectId || null,
          name: `${agentId} operator`,
        }),
      });
      if (isKeyGrant(body)) {
        setAgentApiKey(body.api_key);
        setMintedKey(body.api_key);
      }
      await refreshOperationalData();
      return body;
    });
  }

  async function refreshAgents() {
    const org = requireOrg();
    const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/agents`);
    if (isAgentList(body)) {
      setOrgAgents(body.agents);
    }
    return body;
  }

  async function listAgents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Listed agents", refreshAgents);
  }

  async function rotateKey(rotateAgentId: string) {
    await run("Rotated API key", async () => {
      const org = requireOrg();
      const body = await managementFetch(
        `/v1/orgs/${encodeURIComponent(org)}/agents/${encodeURIComponent(rotateAgentId)}/keys`,
        { method: "POST" },
      );
      if (isKeyGrant(body)) {
        setAgentApiKey(body.api_key);
        setMintedKey(body.api_key);
      }
      await refreshOperationalData();
      return body;
    });
  }

  async function revokeKey(apiKeyId: string) {
    await run("Revoked API key", async () => {
      const org = requireOrg();
      const body = await managementFetch(
        `/v1/orgs/${encodeURIComponent(org)}/keys/${encodeURIComponent(apiKeyId)}`,
        { method: "DELETE" },
      );
      await refreshOperationalData();
      return body;
    });
  }

  async function refreshOrgMemories() {
    const org = requireOrg();
    const query = new URLSearchParams({ limit: "50", offset: "0" });
    if (memoryScopeFilter) query.set("scope", memoryScopeFilter);
    const body = await managementFetch(
      `/v1/orgs/${encodeURIComponent(org)}/memories?${query.toString()}`,
    );
    if (isMemoryList(body)) {
      setOrgMemories(body.memories);
    }
    return body;
  }

  async function listOrgMemories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Listed org memories", refreshOrgMemories);
  }

  async function deleteOrgMemory(deleteMemoryId: string) {
    await run("Deleted memory", async () => {
      const org = requireOrg();
      const body = await managementFetch(
        `/v1/orgs/${encodeURIComponent(org)}/memories/${encodeURIComponent(deleteMemoryId)}`,
        { method: "DELETE" },
      );
      await Promise.all([refreshOrgMemories(), refreshMemoryStats()]);
      return body;
    });
  }

  async function readUsage() {
    await run("Refreshed live dashboard", refreshOperationalData);
  }

  async function checkX402() {
    await run("x402 status", async () => {
      const enabled = await requestX402Status();
      setX402Status(enabled ? "enabled" : "disabled");
      return { enabled };
    });
  }

  async function writeMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Wrote memory", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/memory/write`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey),
        body: JSON.stringify({
          scope,
          content: memory,
          tags: ["positioning", "investor", "trust"],
          project_id: projectId,
          role_id: roleId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (isMemoryRecord(body)) setMemoryId(body.memory_id);
      await Promise.all([refreshOrgMemories(), refreshMemoryStats(), refreshUsage()]);
      return body;
    });
  }

  async function promoteMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Promoted memory", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/memory/promote`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey),
        body: JSON.stringify({
          memory_id: memoryId,
          target_scope: promotionTargetScope,
          reason: promotionReason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (isMemoryRecord(body)) setPromotedMemoryId(body.memory_id);
      await Promise.all([refreshOrgMemories(), refreshMemoryStats(), refreshUsage()]);
      return body;
    });
  }

  async function buildContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Built context", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/context/build`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey),
        body: JSON.stringify({
          task,
          project_id: projectId,
          token_budget: 6000,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      await refreshUsage();
      return body;
    });
  }

  async function readPromotionAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Read promotion audit", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/audit/promotion/${promotedMemoryId}`, {
        headers: agentRequestHeaders(agentApiKey),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (!isPromotionAudit(body)) throw new Error("Promotion audit response was invalid.");
      setPromotionAudit(body);
      await refreshUsage();
      return body;
    });
  }

  async function readAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Read audit", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/audit/context/${requestId}`, {
        headers: agentRequestHeaders(agentApiKey),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (!isContextAudit(body)) throw new Error("Context audit response was invalid.");
      setContextAudit(body);
      return body;
    });
  }

  return (
    <div className="dashboard-console">
      <div className="session-bar" aria-label="Session and organization">
        <span>
          signed in as <strong>{userEmail}</strong>
        </span>
        <div className="session-actions">
          <select
            className="org-select"
            aria-label="Active organization"
            value={orgId}
            onChange={(event) => void setActiveOrganization(event.target.value)}
          >
            <option value="">no active org</option>
            {(organizations ?? []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void readUsage()} disabled={busy || !orgId}>
            <RefreshCcw size={14} aria-hidden="true" />
            Refresh data
          </button>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <section className="dashboard-overview" aria-label="Energon operating model">
        <article className="surface-card command-card">
          <div className="panel-title">
            <Bot size={18} aria-hidden="true" />
            <h2>Agent surface</h2>
          </div>
          <p>
            Agents should call the API or SDK. They do not write directly into pgvector, because
            direct DB access would skip identity, permission filtering, billing, and audit.
          </p>
          <div className="route-map" aria-label="Agent request route">
            <span>agent</span>
            <ArrowRight size={15} aria-hidden="true" />
            <span>API</span>
            <ArrowRight size={15} aria-hidden="true" />
            <span>permissions</span>
            <ArrowRight size={15} aria-hidden="true" />
            <span>Postgres + pgvector</span>
          </div>
        </article>

        <article className="surface-card command-card">
          <div className="panel-title">
            <Users size={18} aria-hidden="true" />
            <h2>Human surface</h2>
          </div>
          <p>
            Humans use this dashboard for visual inspection: memory scopes, promotion state,
            request audits, and operational health.
          </p>
          <div className="human-readout">
            <span>operator view</span>
            <strong>visual audit layer</strong>
          </div>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Database size={18} aria-hidden="true" />
            <span>Storage</span>
          </div>
          <strong>{health?.storage ?? "checking"}</strong>
          <p>{health ? `database: ${health.database}` : "Waiting for API health"}</p>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Gauge size={18} aria-hidden="true" />
            <span>API status</span>
          </div>
          <strong>{health?.status ?? apiStatus}</strong>
          <p>{authMode} active for dashboard requests</p>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Coins size={18} aria-hidden="true" />
            <span>x402 rail</span>
          </div>
          <strong>{x402Status}</strong>
          <p>USDC payment gate for paid agent API calls</p>
          <button className="inline-action" type="button" disabled={busy} onClick={checkX402}>
            <Coins size={16} aria-hidden="true" />
            Check x402
          </button>
        </article>
      </section>

      <section className="visual-grid" aria-label="Live dashboard telemetry">
        <article className="chart-panel">
          <div className="panel-title">
            <BarChart3 size={18} aria-hidden="true" />
            <h2>Live API usage</h2>
          </div>
          {usageRows.length === 0 ? (
            <p className="chart-empty">No paid API operations recorded for this organization yet.</p>
          ) : (
          <div className="split-chart" aria-label="API usage by route">
            {usageRows.map((entry) => (
              <div className="split-row" key={entry.route}>
                <div>
                  <strong>{entry.route}</strong>
                  <span>{entry.paid_calls} paid call(s)</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${Math.max(4, (entry.calls / maxUsageCalls) * 100)}%` }} />
                </div>
                <em>{entry.calls}</em>
              </div>
            ))}
          </div>
          )}
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2>Latest context audit</h2>
          </div>
          {contextAudit ? (
            <>
              <div className="funnel-chart" aria-label="Latest context audit counts">
                {auditRows.map(([label, count]) => (
                  <span
                    key={label}
                    style={{ width: `${Math.max(18, (count / maxAuditCount) * 100)}%` }}
                  >
                    {label}: {count}
                  </span>
                ))}
              </div>
              <p className="chart-note">
                {contextAudit.estimated_tokens.toLocaleString()} of {contextAudit.token_budget.toLocaleString()} token budget used
              </p>
            </>
          ) : (
            <p className="chart-empty">Build context, then read its audit to inspect the live permission result.</p>
          )}
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <Eye size={18} aria-hidden="true" />
            <h2>Memory by scope</h2>
          </div>
          {scopeRows.length === 0 ? (
            <p className="chart-empty">No memory has been stored in this organization yet.</p>
          ) : (
          <div className="scope-chart" aria-label="Memory counts by scope">
            {scopeRows.map((entry) => (
              <div className="scope-bar" key={entry.scope}>
                <span>{entry.scope}</span>
                <div>
                  <i style={{ height: `${Math.max(8, (entry.count / maxScopeCount) * 100)}%` }} />
                </div>
                <em>{entry.count}</em>
              </div>
            ))}
          </div>
          )}
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <FileSearch size={18} aria-hidden="true" />
            <h2>Workspace readiness</h2>
          </div>
          <div className="lifecycle-list">
            {lifecycle.map(([label, done, detail]) => (
              <div className={done ? "lifecycle-item active" : "lifecycle-item"} key={label}>
                <span />
                <div>
                  <strong>{label}</strong>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="console-grid">
      <BillingCheckout apiBaseUrl={cleanBaseUrl} orgId={orgId} />
      <section id="agents" className="ops-panel" aria-labelledby="agents-title">
        <div className="panel-title">
          <KeyRound size={18} aria-hidden="true" />
          <h2 id="agents-title">Agent access</h2>
        </div>
        <form onSubmit={checkHealth}>
          <label>
            API base URL
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            <Gauge size={16} aria-hidden="true" />
            Check API health
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={createOrganization}>
          <label>
            New organization name
            <input
              value={newOrgName}
              onChange={(event) => setNewOrgName(event.target.value)}
              placeholder="acme swarm"
            />
          </label>
          <button type="submit" disabled={busy || !newOrgName.trim()}>
            <Users size={16} aria-hidden="true" />
            Create organization
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={createAgent}>
          <div className="form-row">
            <label>
              Agent ID
              <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
            </label>
            <label>
              Org ID (active org)
              <input value={orgId} readOnly placeholder="create an organization first" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Role
              <input value={roleId} onChange={(event) => setRoleId(event.target.value)} />
            </label>
            <label>
              Project
              <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
            </label>
          </div>
          <button type="submit" disabled={busy || !orgId || !agentId.trim()}>
            <PackageCheck size={16} aria-hidden="true" />
            Create agent + API key
          </button>
        </form>
        {mintedKey ? (
          <p className="key-once">
            API key (shown once, store it now): <br />
            {mintedKey}
          </p>
        ) : null}
      </section>

      <section id="org-agents" className="ops-panel" aria-labelledby="org-agents-title">
        <div className="panel-title">
          <ListChecks size={18} aria-hidden="true" />
          <h2 id="org-agents-title">Org agents and keys</h2>
        </div>
        <form onSubmit={listAgents}>
          <button type="submit" disabled={busy || !orgId}>
            <RefreshCcw size={16} aria-hidden="true" />
            List agents
          </button>
        </form>
        {orgAgents.length > 0 ? (
          <div className="data-table" aria-label="Agents in the active organization">
            {orgAgents.map((agent) => (
              <div className="data-table-row" key={agent.agent_id}>
                <strong>{agent.agent_id}</strong>
                <span>
                  {agent.keys.filter((key) => key.revoked_at_unix_ms === null).length} active key(s)
                </span>
                <span>{agent.role_id ?? "no role"}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void rotateKey(agent.agent_id)}
                >
                  <RefreshCcw size={14} aria-hidden="true" />
                  Rotate
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {orgAgents.some((agent) => agent.keys.length > 0) ? (
          <div className="data-table" aria-label="API keys in the active organization">
            {orgAgents.flatMap((agent) =>
              agent.keys.map((key) => (
                <div className="data-table-row" key={key.api_key_id}>
                  <strong>{key.api_key_id}</strong>
                  <span>{agent.agent_id}</span>
                  <span>{key.revoked_at_unix_ms === null ? "active" : "revoked"}</span>
                  <button
                    type="button"
                    disabled={busy || key.revoked_at_unix_ms !== null}
                    onClick={() => void revokeKey(key.api_key_id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Revoke
                  </button>
                </div>
              )),
            )}
          </div>
        ) : null}
      </section>

      <section id="org-memories" className="ops-panel wide" aria-labelledby="org-memories-title">
        <div className="panel-title">
          <Database size={18} aria-hidden="true" />
          <h2 id="org-memories-title">Org memories</h2>
        </div>
        <form onSubmit={listOrgMemories}>
          <div className="form-row">
            <label>
              Scope filter
              <select
                value={memoryScopeFilter}
                onChange={(event) => setMemoryScopeFilter(event.target.value as "" | MemoryScope)}
              >
                <option value="">all scopes</option>
                <option value="open">open</option>
                <option value="org">org</option>
                <option value="project">project</option>
                <option value="role">role</option>
                <option value="agent_private">agent_private</option>
                <option value="user_private">user_private</option>
                <option value="session">session</option>
              </select>
            </label>
            <label>
              Active org
              <input value={orgId} readOnly />
            </label>
          </div>
          <button type="submit" disabled={busy || !orgId}>
            <RefreshCcw size={16} aria-hidden="true" />
            List memories
          </button>
        </form>
        {orgMemories.length > 0 ? (
          <div className="data-table" aria-label="Memories in the active organization">
            {orgMemories.map((entry) => (
              <div className="data-table-row" key={entry.memory_id}>
                <strong>{entry.content_preview}</strong>
                <span>{entry.memory_id}</span>
                <span>{entry.scope}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteOrgMemory(entry.memory_id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section id="memory" className="ops-panel" aria-labelledby="memory-title">
        <div className="panel-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2 id="memory-title">Memory write</h2>
        </div>
        <form onSubmit={writeMemory}>
          <label>
            Agent API key
            <input
              value={agentApiKey}
              onChange={(event) => setAgentApiKey(event.target.value)}
              type="password"
              placeholder="created or rotated in Agent access"
            />
          </label>
          <label>
            Scope
            <select value={scope} onChange={(event) => setScope(event.target.value as MemoryScope)}>
              <option value="agent_private">agent_private</option>
            </select>
          </label>
          <label>
            Memory
            <textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={5} />
          </label>
          <button type="submit" disabled={busy || !hasAgentApiKey}>
            <Send size={16} aria-hidden="true" />
            Write memory
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={promoteMemory}>
          <div className="form-row">
            <label>
              Source memory ID
              <input value={memoryId} onChange={(event) => setMemoryId(event.target.value)} />
            </label>
            <label>
              Target scope
              <select
                value={promotionTargetScope}
                onChange={(event) =>
                  setPromotionTargetScope(event.target.value as SharedMemoryScope)
                }
              >
                <option value="project">project</option>
                <option value="org">org</option>
                <option value="role">role</option>
                <option value="open">open</option>
              </select>
            </label>
          </div>
          <label>
            Promotion reason
            <textarea
              value={promotionReason}
              onChange={(event) => setPromotionReason(event.target.value)}
              rows={3}
            />
          </label>
          <button type="submit" disabled={busy || !memoryId || !hasAgentApiKey}>
            <ArrowUpRight size={16} aria-hidden="true" />
            Promote private memory
          </button>
        </form>
      </section>

      <section id="context" className="ops-panel wide" aria-labelledby="context-title">
        <div className="panel-title">
          <Send size={18} aria-hidden="true" />
          <h2 id="context-title">Context build</h2>
        </div>
        <form onSubmit={buildContext}>
          <label>
            Task
            <input value={task} onChange={(event) => setTask(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !hasAgentApiKey}>
            <ShieldCheck size={16} aria-hidden="true" />
            Build context
          </button>
        </form>
        <form onSubmit={readAudit} className="audit-form">
          <label>
            Request ID
            <input value={requestId} onChange={(event) => setRequestId(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !requestId || !hasAgentApiKey}>
            <KeyRound size={16} aria-hidden="true" />
            Read audit
          </button>
        </form>
        <form onSubmit={readPromotionAudit} className="audit-form">
          <label>
            Promoted memory ID
            <input
              value={promotedMemoryId}
              onChange={(event) => setPromotedMemoryId(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !promotedMemoryId || !hasAgentApiKey}>
            <FileSearch size={16} aria-hidden="true" />
            Read promotion audit
          </button>
        </form>
      </section>

      <section id="audit" className="result-panel" aria-live="polite" aria-label="API result">
        <div className="panel-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2>{result.label}</h2>
        </div>
        <pre>{JSON.stringify(result.body, null, 2)}</pre>
        {promotionAudit ? (
          <p className="chart-note">
            Latest promotion: {promotionAudit.source_memory_id} to {promotionAudit.target_scope}
          </p>
        ) : null}
      </section>
      </div>
    </div>
  );
}

function agentRequestHeaders(apiKey: string) {
  const cleanApiKey = apiKey.trim();
  if (!cleanApiKey) {
    throw new Error("Create or rotate an agent API key before using memory operations.");
  }

  return {
    "content-type": "application/json",
    Authorization: `Bearer ${cleanApiKey}`,
  };
}

function isContextPack(value: unknown): value is { request_id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "request_id" in value &&
    typeof (value as { request_id: unknown }).request_id === "string"
  );
}

function isMemoryRecord(value: unknown): value is { memory_id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "memory_id" in value &&
    typeof (value as { memory_id: unknown }).memory_id === "string"
  );
}

function isKeyGrant(value: unknown): value is { api_key: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "api_key" in value &&
    typeof (value as { api_key: unknown }).api_key === "string"
  );
}

function isAgentList(value: unknown): value is { agents: OrgAgent[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "agents" in value &&
    Array.isArray((value as { agents: unknown }).agents)
  );
}

function isMemoryList(value: unknown): value is { memories: OrgMemory[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "memories" in value &&
    Array.isArray((value as { memories: unknown }).memories)
  );
}

function isApiHealth(value: unknown): value is ApiHealth {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "storage" in value &&
    "database" in value &&
    ((value as { status: unknown }).status === "ok" ||
      (value as { status: unknown }).status === "degraded")
  );
}

function isX402Status(value: unknown): value is { enabled: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    typeof (value as { enabled: unknown }).enabled === "boolean"
  );
}

function isUsageSummary(value: unknown): value is UsageSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "storage" in value &&
    "totals" in value &&
    Array.isArray((value as { totals: unknown }).totals)
  );
}

function isMemoryStats(value: unknown): value is MemoryStats {
  return (
    typeof value === "object" &&
    value !== null &&
    "total_memories" in value &&
    typeof (value as { total_memories: unknown }).total_memories === "number" &&
    "scopes" in value &&
    Array.isArray((value as { scopes: unknown }).scopes)
  );
}

function isContextAudit(value: unknown): value is ContextAudit {
  return (
    typeof value === "object" &&
    value !== null &&
    "request_id" in value &&
    typeof (value as { request_id: unknown }).request_id === "string" &&
    "allowed_memory_ids" in value &&
    Array.isArray((value as { allowed_memory_ids: unknown }).allowed_memory_ids) &&
    "denied_memory_count" in value &&
    typeof (value as { denied_memory_count: unknown }).denied_memory_count === "number" &&
    "estimated_tokens" in value &&
    typeof (value as { estimated_tokens: unknown }).estimated_tokens === "number" &&
    "token_budget" in value &&
    typeof (value as { token_budget: unknown }).token_budget === "number"
  );
}

function isPromotionAudit(value: unknown): value is PromotionAudit {
  return (
    typeof value === "object" &&
    value !== null &&
    "promotion_id" in value &&
    typeof (value as { promotion_id: unknown }).promotion_id === "string" &&
    "source_memory_id" in value &&
    typeof (value as { source_memory_id: unknown }).source_memory_id === "string" &&
    "promoted_memory_id" in value &&
    typeof (value as { promoted_memory_id: unknown }).promoted_memory_id === "string" &&
    "target_scope" in value &&
    typeof (value as { target_scope: unknown }).target_scope === "string" &&
    "reason" in value &&
    typeof (value as { reason: unknown }).reason === "string"
  );
}
