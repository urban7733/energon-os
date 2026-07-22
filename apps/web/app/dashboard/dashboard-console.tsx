"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Coins,
  Database,
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
import { AnalyticsDeck } from "../../components/dashboard/analytics-deck";
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
  const [agentName, setAgentName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [scope, setScope] = useState<MemoryScope>("agent_private");
  const [memoryId, setMemoryId] = useState("");
  const [promotedMemoryId, setPromotedMemoryId] = useState("");
  const [promotionTargetScope, setPromotionTargetScope] = useState<"" | SharedMemoryScope>("");
  const [promotionReason, setPromotionReason] = useState("");
  const [memory, setMemory] = useState("");
  const [memoryTags, setMemoryTags] = useState("");
  const [task, setTask] = useState("");
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
    label: "No activity yet",
    body: null,
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
  const scopeRows = memoryStats?.scopes ?? [];

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
    setAgentId("");
    setAgentName("");
    setRoleId("");
    setProjectId("");
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
      const cleanAgentId = agentId.trim();
      if (!cleanAgentId) throw new Error("Agent ID is required.");
      const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/agents`, {
        method: "POST",
        body: JSON.stringify({
          agent_id: cleanAgentId,
          role_id: roleId.trim() || null,
          project_id: projectId.trim() || null,
          name: agentName.trim() || cleanAgentId,
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
      const content = memory.trim();
      if (!content) throw new Error("Private memory content is required.");
      const response = await fetch(`${cleanBaseUrl}/v1/memory/write`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey),
        body: JSON.stringify({
          scope,
          content,
          tags: parseTags(memoryTags),
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
      if (!promotionTargetScope) throw new Error("Choose a scope for shared memory.");
      if (!promotionReason.trim()) throw new Error("A reason for sharing is required.");
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
      const cleanTask = task.trim();
      if (!cleanTask) throw new Error("Describe the task before building context.");
      const response = await fetch(`${cleanBaseUrl}/v1/context/build`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey),
        body: JSON.stringify({
          task: cleanTask,
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
          Signed in: <strong>{userEmail}</strong>
        </span>
        <div className="session-actions">
          <select
            className="org-select"
            aria-label="Active organization"
            value={orgId}
            onChange={(event) => void setActiveOrganization(event.target.value)}
          >
            <option value="">Choose a workspace</option>
            {(organizations ?? []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void readUsage()} disabled={busy || !orgId}>
            <RefreshCcw size={14} aria-hidden="true" />
            Refresh workspace
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
            <h2>For your agents</h2>
          </div>
          <p>
            Each agent uses its own API key and starts with private memory. Energon decides what
            that agent is allowed to read before it receives context.
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
            <h2>For you</h2>
          </div>
          <p>
            Create agents, approve what they can share, and review every context decision in one place.
          </p>
          <div className="human-readout">
            <span>your control</span>
            <strong>private first, shared by approval</strong>
          </div>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Database size={18} aria-hidden="true" />
            <span>Memory storage</span>
          </div>
          <strong>{health?.storage ?? "checking"}</strong>
          <p>{health ? `database: ${health.database}` : "Waiting for API health"}</p>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Gauge size={18} aria-hidden="true" />
            <span>Connection</span>
          </div>
          <strong>{health?.status ?? apiStatus}</strong>
          <p>{authMode}</p>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Coins size={18} aria-hidden="true" />
            <span>Agent payments</span>
          </div>
          <strong>{x402Status}</strong>
          <p>USDC on Base for paid memory actions</p>
          <button className="inline-action" type="button" disabled={busy} onClick={checkX402}>
            <Coins size={16} aria-hidden="true" />
            Check payments
          </button>
        </article>
      </section>

      <AnalyticsDeck
        usage={usageRows}
        scopes={scopeRows}
        totalMemories={memoryStats?.total_memories ?? 0}
        agentCount={orgAgents.length}
        contextAudit={contextAudit}
        lifecycle={lifecycle}
      />

      <div className="console-grid">
      <section id="agents" className="ops-panel" aria-labelledby="agents-title">
        <div className="panel-title">
          <KeyRound size={18} aria-hidden="true" />
          <h2 id="agents-title">1. Set up your workspace and agent</h2>
        </div>
        <form onSubmit={checkHealth}>
          <label>
            API address
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            <Gauge size={16} aria-hidden="true" />
            Check connection
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={createOrganization}>
          <label>
            New workspace name
            <input
              value={newOrgName}
              onChange={(event) => setNewOrgName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !newOrgName.trim()}>
            <Users size={16} aria-hidden="true" />
            Create workspace
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={createAgent}>
          <div className="form-row">
            <label>
              Agent name (optional)
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
            </label>
            <label>
              Agent ID
              <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Current workspace
              <input value={orgId} readOnly placeholder="create a workspace first" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Role (optional)
              <input value={roleId} onChange={(event) => setRoleId(event.target.value)} />
            </label>
            <label>
              Project (optional)
              <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
            </label>
          </div>
          <button type="submit" disabled={busy || !orgId || !agentId.trim()}>
            <PackageCheck size={16} aria-hidden="true" />
            Create agent and API key
          </button>
        </form>
        {mintedKey ? (
          <p className="key-once">
            Your agent's API key. Copy it now; it is shown only once: <br />
            {mintedKey}
          </p>
        ) : null}
      </section>

      <BillingCheckout apiBaseUrl={cleanBaseUrl} orgId={orgId} />

      <section id="org-agents" className="ops-panel" aria-labelledby="org-agents-title">
        <div className="panel-title">
          <ListChecks size={18} aria-hidden="true" />
          <h2 id="org-agents-title">2. Manage agents and keys</h2>
        </div>
        <form onSubmit={listAgents}>
          <button type="submit" disabled={busy || !orgId}>
            <RefreshCcw size={16} aria-hidden="true" />
            Refresh agents
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
          <h2 id="org-memories-title">Saved memory in this workspace</h2>
        </div>
        <form onSubmit={listOrgMemories}>
          <div className="form-row">
            <label>
              Show memories
              <select
                value={memoryScopeFilter}
                onChange={(event) => setMemoryScopeFilter(event.target.value as "" | MemoryScope)}
              >
                <option value="">all memories</option>
                <option value="open">shared with everyone</option>
                <option value="org">shared with workspace</option>
                <option value="project">shared with project</option>
                <option value="role">shared with role</option>
                <option value="agent_private">private to one agent</option>
                <option value="user_private">private to one user</option>
                <option value="session">private to this session</option>
              </select>
            </label>
            <label>
              Current workspace
              <input value={orgId} readOnly />
            </label>
          </div>
          <button type="submit" disabled={busy || !orgId}>
            <RefreshCcw size={16} aria-hidden="true" />
            Refresh memory
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
          <h2 id="memory-title">3. Save a private memory</h2>
        </div>
        <form onSubmit={writeMemory}>
          <label>
            Agent API key
            <input
              value={agentApiKey}
              onChange={(event) => setAgentApiKey(event.target.value)}
              type="password"
              placeholder="created or rotated above"
            />
          </label>
          <label>
            Sharing
            <select value={scope} onChange={(event) => setScope(event.target.value as MemoryScope)}>
              <option value="agent_private">private to this agent</option>
            </select>
          </label>
          <label>
            Private note
            <textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={5} required />
          </label>
          <label>
            Tags (optional, comma-separated)
            <input value={memoryTags} onChange={(event) => setMemoryTags(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !hasAgentApiKey || !memory.trim()}>
            <Send size={16} aria-hidden="true" />
            Save private memory
          </button>
        </form>
        <div className="panel-divider" />
        <form onSubmit={promoteMemory}>
          <div className="form-row">
            <label>
              Private memory ID to share
              <input value={memoryId} onChange={(event) => setMemoryId(event.target.value)} />
            </label>
            <label>
              Share with
              <select
                value={promotionTargetScope}
                onChange={(event) =>
                  setPromotionTargetScope(event.target.value as "" | SharedMemoryScope)
                }
              >
                <option value="" disabled>choose a scope</option>
                <option value="project">this project</option>
                <option value="org">this workspace</option>
                <option value="role">this role</option>
                <option value="open">everyone approved by policy</option>
              </select>
            </label>
          </div>
          <label>
            Why share this note?
            <textarea
              value={promotionReason}
              onChange={(event) => setPromotionReason(event.target.value)}
              rows={3}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !memoryId || !promotionTargetScope || !promotionReason.trim() || !hasAgentApiKey}
          >
            <ArrowUpRight size={16} aria-hidden="true" />
            Share this memory
          </button>
        </form>
      </section>

      <section id="context" className="ops-panel wide" aria-labelledby="context-title">
        <div className="panel-title">
          <Send size={18} aria-hidden="true" />
          <h2 id="context-title">4. Build safe context for an agent</h2>
        </div>
        <form onSubmit={buildContext}>
          <label>
            What does the agent need to do?
            <input value={task} onChange={(event) => setTask(event.target.value)} required />
          </label>
          <button type="submit" disabled={busy || !hasAgentApiKey || !task.trim()}>
            <ShieldCheck size={16} aria-hidden="true" />
            Build safe context
          </button>
        </form>
        <form onSubmit={readAudit} className="audit-form">
          <label>
            Context request ID
            <input value={requestId} onChange={(event) => setRequestId(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !requestId || !hasAgentApiKey}>
            <KeyRound size={16} aria-hidden="true" />
            Show context record
          </button>
        </form>
        <form onSubmit={readPromotionAudit} className="audit-form">
          <label>
            Shared memory ID
            <input
              value={promotedMemoryId}
              onChange={(event) => setPromotedMemoryId(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !promotedMemoryId || !hasAgentApiKey}>
            <FileSearch size={16} aria-hidden="true" />
            Show sharing record
          </button>
        </form>
      </section>

      <section id="audit" className="result-panel" aria-live="polite" aria-label="API result">
        <div className="panel-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2>Recent activity: {result.label}</h2>
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

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
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
