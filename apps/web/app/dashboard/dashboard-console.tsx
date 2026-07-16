"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
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

export function DashboardConsole({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  const [apiBaseUrl, setApiBaseUrl] = useState(site.apiBaseUrl);
  const [agentApiKey, setAgentApiKey] = useState("");
  const [agentId, setAgentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [scope, setScope] = useState<MemoryScope>("agent_private");
  const [memoryId, setMemoryId] = useState("");
  const [promotedMemoryId, setPromotedMemoryId] = useState("");
  const [promotionTargetScope, setPromotionTargetScope] = useState<SharedMemoryScope>("project");
  const [promotionReason, setPromotionReason] = useState("");
  const [memory, setMemory] = useState("");
  const [task, setTask] = useState("");
  const [requestId, setRequestId] = useState("");
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [orgMemories, setOrgMemories] = useState<OrgMemory[]>([]);
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
  const authMode = agentApiKey.trim() ? "Bearer API key" : "Dev identity headers";

  /**
   * Re-runs the server component tree (including the DB-backed analytics) so
   * KPIs, charts, and the activity feed reflect the mutation that just ran.
   */
  function refreshAnalytics() {
    router.refresh();
  }

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
      refreshAnalytics();
      return { organization_id: created.data.id, name, slug };
    });
  }

  async function setActiveOrganization(organizationId: string) {
    if (!organizationId) return;
    await run("Switched organization", async () => {
      const outcome = await authClient.organization.setActive({ organizationId });
      if (outcome.error) throw new Error(outcome.error.message ?? "Failed to switch org");
      refreshAnalytics();
      return { active_organization_id: organizationId };
    });
  }

  async function checkHealth(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${cleanBaseUrl}/health`);
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      setApiStatus("online");
      setResult({ label: "API health", body });
    } catch (error) {
      setApiStatus("offline");
      setResult({
        label: "API health failed",
        body:
          error instanceof Error
            ? `${error.message}. Start the API on ${cleanBaseUrl}.`
            : String(error),
      });
    } finally {
      setBusy(false);
    }
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
      await refreshAgents();
      refreshAnalytics();
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
      await refreshAgents();
      refreshAnalytics();
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
      await refreshAgents();
      refreshAnalytics();
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
      await refreshOrgMemories();
      refreshAnalytics();
      return body;
    });
  }

  async function readUsage() {
    await run("Usage summary", async () => {
      const org = requireOrg();
      return managementFetch(`/v1/orgs/${encodeURIComponent(org)}/usage`);
    });
  }

  async function checkX402() {
    setBusy(true);
    try {
      const response = await fetch(`${cleanBaseUrl}/v1/billing/x402`);
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      setX402Status(Boolean(body.enabled) ? "enabled" : "disabled");
      setResult({ label: "x402 status", body });
    } catch (error) {
      setX402Status("offline");
      setResult({
        label: "x402 status failed",
        body:
          error instanceof Error
            ? `${error.message}. Start the API on ${cleanBaseUrl}.`
            : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function writeMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Wrote memory", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/memory/write`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
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
      refreshAnalytics();
      return body;
    });
  }

  async function promoteMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Promoted memory", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/memory/promote`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
        body: JSON.stringify({
          memory_id: memoryId,
          target_scope: promotionTargetScope,
          reason: promotionReason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (isMemoryRecord(body)) setPromotedMemoryId(body.memory_id);
      refreshAnalytics();
      return body;
    });
  }

  async function buildContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Built context", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/context/build`, {
        method: "POST",
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
        body: JSON.stringify({
          task,
          project_id: projectId,
          token_budget: 6000,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      refreshAnalytics();
      return body;
    });
  }

  async function readPromotionAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Read promotion audit", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/audit/promotion/${promotedMemoryId}`, {
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body;
    });
  }

  async function readAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Read audit", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/audit/context/${requestId}`, {
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body;
    });
  }

  return (
    <div className="dashboard-console">
      <div className="session-bar" aria-label="Session and organization">
        <div className="session-identity">
          <span>
            signed in as <strong>{userEmail}</strong>
          </span>
          <div className="session-status">
            <span className="status-chip" data-state={apiStatus}>
              <i aria-hidden="true" />
              api {apiStatus}
            </span>
            <span className="status-chip" data-state={x402Status}>
              <i aria-hidden="true" />
              x402 {x402Status}
            </span>
            <span className="status-chip status-chip-muted">{authMode.toLowerCase()}</span>
          </div>
        </div>
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
          <button type="button" onClick={() => void checkHealth()} disabled={busy}>
            <Gauge size={14} aria-hidden="true" />
            Health
          </button>
          <button type="button" onClick={() => void checkX402()} disabled={busy}>
            <Coins size={14} aria-hidden="true" />
            x402
          </button>
          <button type="button" onClick={() => void readUsage()} disabled={busy || !orgId}>
            <BarChart3 size={14} aria-hidden="true" />
            Usage
          </button>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <div className="console-grid">
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
              <input
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                placeholder="unique agent id"
              />
            </label>
            <label>
              Org ID (active org)
              <input value={orgId} readOnly placeholder="create an organization first" />
            </label>
          </div>
          <div className="form-row">
            <label>
              Role
              <input
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                placeholder="optional"
              />
            </label>
            <label>
              Project
              <input
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="optional"
              />
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
              placeholder="optional: empty uses dev identity headers"
            />
          </label>
          <label>
            Scope
            <select value={scope} onChange={(event) => setScope(event.target.value as MemoryScope)}>
              <option value="agent_private">agent_private</option>
              <option value="project">project</option>
              <option value="org">org</option>
              <option value="open">open</option>
              <option value="role">role</option>
              <option value="session">session</option>
              <option value="user_private">user_private</option>
            </select>
          </label>
          <label>
            Memory
            <textarea
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              rows={5}
              placeholder="memory content to store for this agent"
            />
          </label>
          <button type="submit" disabled={busy || !memory.trim()}>
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
              placeholder="why this memory can be shared"
            />
          </label>
          <button type="submit" disabled={busy || !memoryId || !promotionReason.trim()}>
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
            <input
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="task the agent needs context for"
            />
          </label>
          <button type="submit" disabled={busy || !task.trim()}>
            <ShieldCheck size={16} aria-hidden="true" />
            Build context
          </button>
        </form>
        <form onSubmit={readAudit} className="audit-form">
          <label>
            Request ID
            <input value={requestId} onChange={(event) => setRequestId(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !requestId}>
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
          <button type="submit" disabled={busy || !promotedMemoryId}>
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
      </section>
      </div>
    </div>
  );
}

function agentRequestHeaders(
  apiKey: string,
  agentId: string,
  orgId: string,
  roleId?: string,
  projectId?: string,
) {
  const cleanApiKey = apiKey.trim();
  if (cleanApiKey) {
    return {
      "content-type": "application/json",
      Authorization: `Bearer ${cleanApiKey}`,
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-energon-agent-id": agentId,
    "x-energon-org-id": orgId || "org_1",
  };

  if (roleId?.trim()) headers["x-energon-role-id"] = roleId.trim();
  if (projectId?.trim()) headers["x-energon-project-id"] = projectId.trim();

  return headers;
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
