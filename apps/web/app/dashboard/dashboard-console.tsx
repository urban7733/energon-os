"use client";

import { FormEvent, useMemo, useState } from "react";
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
  Network,
  PackageCheck,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
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
type MemoryGraphNode = {
  id: string;
  kind:
    | "identity"
    | "agent"
    | "payment"
    | "memory"
    | "shared"
    | "vector"
    | "context"
    | "audit";
  label: string;
  title: string;
  detail: string;
  owner: string;
  location: string;
  access: string;
  status: string;
  active: boolean;
  x: number;
  y: number;
};

const rawMemoryGraphEdges = [
  { from: "org", to: "agent", label: "tenant" },
  { from: "project", to: "agent", label: "project" },
  { from: "role", to: "agent", label: "role" },
  { from: "agent", to: "private-memory", label: "writes" },
  { from: "private-memory", to: "shared-memory", label: "promotes" },
  { from: "private-memory", to: "vector-index", label: "chunks" },
  { from: "shared-memory", to: "vector-index", label: "shared" },
  { from: "agent", to: "context-build", label: "requests" },
  { from: "payment-rail", to: "context-build", label: "x402" },
  { from: "vector-index", to: "context-build", label: "retrieves" },
  { from: "context-build", to: "audit-log", label: "records" },
] as const;

export function DashboardConsole() {
  const [apiBaseUrl, setApiBaseUrl] = useState(site.apiBaseUrl);
  const [adminToken, setAdminToken] = useState("");
  const [agentApiKey, setAgentApiKey] = useState("");
  const [agentId, setAgentId] = useState("agent_777");
  const [orgId, setOrgId] = useState("org_1");
  const [roleId, setRoleId] = useState("strategist");
  const [projectId, setProjectId] = useState("apex_verify");
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
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState("agent");
  const [busy, setBusy] = useState(false);

  const cleanBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);
  const authMode = agentApiKey.trim() ? "Bearer API key" : "Dev identity headers";
  const lifecycle = [
    ["API health", apiStatus === "online", apiStatus],
    ["Agent identity", Boolean(agentApiKey || agentId), agentApiKey ? "bearer key" : "dev headers"],
    ["Private memory", Boolean(memoryId), memoryId || "not written"],
    ["Promotion", Boolean(promotedMemoryId), promotedMemoryId || "not promoted"],
    ["Context audit", Boolean(requestId), requestId || "not built"],
  ] as const;
  const accessBars = [
    ["Agent API", 86, "paid autonomous usage"],
    ["Human dashboard", 14, "visual operations"],
  ] as const;
  const scopeBars = [
    ["open", scope === "open" ? 82 : 22],
    ["org", scope === "org" ? 82 : 38],
    ["project", scope === "project" ? 82 : 54],
    ["role", scope === "role" ? 82 : 34],
    ["private", scope.includes("private") ? 82 : 48],
    ["session", scope === "session" ? 82 : 28],
  ] as const;
  const memoryPreview = compactText(memory, 96);
  const memoryGraphNodes: MemoryGraphNode[] = [
    {
      id: "org",
      kind: "identity",
      label: "org",
      title: orgId || "org missing",
      detail: "Tenant boundary for shared organizational memory.",
      owner: orgId || "unset",
      location: "organization",
      access: "org scoped memory",
      status: orgId ? "mapped" : "missing",
      active: Boolean(orgId),
      x: 12,
      y: 18,
    },
    {
      id: "project",
      kind: "identity",
      label: "project",
      title: projectId || "project missing",
      detail: "Mission or customer case that constrains retrieval.",
      owner: orgId || "unset",
      location: projectId || "unset",
      access: "project scoped memory",
      status: projectId ? "mapped" : "missing",
      active: Boolean(projectId),
      x: 12,
      y: 50,
    },
    {
      id: "role",
      kind: "identity",
      label: "role",
      title: roleId || "role missing",
      detail: "Work function used for role memory and policy decisions.",
      owner: agentId || "unset",
      location: roleId || "unset",
      access: "role scoped memory",
      status: roleId ? "mapped" : "missing",
      active: Boolean(roleId),
      x: 12,
      y: 82,
    },
    {
      id: "agent",
      kind: "agent",
      label: "agent",
      title: agentId || "agent missing",
      detail: `Authenticated through ${authMode}.`,
      owner: agentId || "unset",
      location: `${orgId || "org"} / ${projectId || "project"}`,
      access: agentApiKey.trim() ? "bearer key" : "dev identity headers",
      status: apiStatus,
      active: Boolean(agentId),
      x: 34,
      y: 50,
    },
    {
      id: "payment-rail",
      kind: "payment",
      label: "payment",
      title: "x402 rail",
      detail: "Paid autonomous API calls are challenged before protected memory routes run.",
      owner: "agent wallet",
      location: "paid API routes",
      access: "crypto payment gate",
      status: x402Status,
      active: x402Status === "enabled",
      x: 36,
      y: 82,
    },
    {
      id: "private-memory",
      kind: "memory",
      label: "private memory",
      title: memoryId || "draft memory",
      detail: memoryPreview,
      owner: agentId || "unset",
      location: scope,
      access: scope.includes("private") ? "owner only" : "shared scope draft",
      status: memoryId ? "written" : "not written",
      active: Boolean(memoryId),
      x: 58,
      y: 26,
    },
    {
      id: "shared-memory",
      kind: "shared",
      label: "shared memory",
      title: promotedMemoryId || promotionTargetScope,
      detail: promotionReason,
      owner: orgId || "unset",
      location: promotionTargetScope,
      access: "explicit private-to-shared promotion",
      status: promotedMemoryId ? "promoted" : "waiting for promotion",
      active: Boolean(promotedMemoryId),
      x: 58,
      y: 72,
    },
    {
      id: "vector-index",
      kind: "vector",
      label: "pgvector",
      title: "semantic index",
      detail: "memory_chunks.embedding stores searchable vector chunks after permissioned writes.",
      owner: "Energon DB",
      location: "Postgres + pgvector",
      access: "API mediated only",
      status: apiStatus === "online" ? "available" : "not checked",
      active: apiStatus === "online" || Boolean(memoryId || promotedMemoryId),
      x: 78,
      y: 50,
    },
    {
      id: "context-build",
      kind: "context",
      label: "context",
      title: requestId || "context build",
      detail: task,
      owner: agentId || "unset",
      location: projectId || "unset",
      access: "permission filtered before packing",
      status: requestId ? "built" : "not built",
      active: Boolean(requestId),
      x: 90,
      y: 24,
    },
    {
      id: "audit-log",
      kind: "audit",
      label: "audit",
      title: result.label,
      detail: "Shows which memory influenced the response and which promotion path changed scope.",
      owner: "human operator",
      location: "dashboard",
      access: "human visual inspection",
      status: requestId || promotedMemoryId ? "inspectable" : "waiting",
      active: Boolean(requestId || promotedMemoryId),
      x: 90,
      y: 78,
    },
  ];
  const selectedGraphNode =
    memoryGraphNodes.find((node) => node.id === selectedGraphNodeId) ?? memoryGraphNodes[3];
  const memoryGraphEdges = rawMemoryGraphEdges.flatMap((edge) => {
    const fromNode = memoryGraphNodes.find((node) => node.id === edge.from);
    const toNode = memoryGraphNodes.find((node) => node.id === edge.to);
    if (!fromNode || !toNode) return [];
    return [
      {
        ...edge,
        active: fromNode.active && toNode.active,
        fromNode,
        toNode,
      },
    ];
  });

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
    if (!adminToken.trim()) {
      await run("Using dev identity", async () => ({
        status: "dev_identity_ready",
        auth_mode: "Dev identity headers",
        agent_id: agentId,
        org_id: orgId,
        role_id: roleId,
        project_id: projectId,
        note: "No bearer key is needed when the API runs with in-memory/dev identity headers. Set Admin token to create a real Postgres-backed API key.",
      }));
      return;
    }

    await run("Created agent", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/admin/agents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-energon-admin-token": adminToken,
        },
        body: JSON.stringify({
          agent_id: agentId,
          org_id: orgId,
          role_id: roleId,
          project_id: projectId,
          name: `${agentId} operator`,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      if (typeof body.api_key === "string") setAgentApiKey(body.api_key);
      return body;
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

  async function exportObsidianVault() {
    await run("Exported Obsidian vault", async () => {
      const params = new URLSearchParams();
      if (projectId.trim()) params.set("project_id", projectId.trim());
      params.set("limit", "500");

      const response = await fetch(`${cleanBaseUrl}/v1/vault/obsidian.zip?${params}`, {
        headers: agentRequestHeaders(agentApiKey, agentId, orgId, roleId, projectId),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `energon-obsidian-vault-${agentId || "agent"}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      return {
        status: "download_started",
        format: "obsidian_vault_zip",
        endpoint: "/v1/vault/obsidian.zip",
        agent_id: agentId,
        project_id: projectId,
      };
    });
  }

  return (
    <div className="dashboard-console">
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
            <span>Vector index</span>
          </div>
          <strong>pgvector</strong>
          <p>memory_chunks.embedding vector(1536) with HNSW cosine index</p>
        </article>

        <article className="surface-card metric-card">
          <div className="metric-card-head">
            <Gauge size={18} aria-hidden="true" />
            <span>API status</span>
          </div>
          <strong>{apiStatus}</strong>
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

      <section className="visual-grid" aria-label="Dashboard visual telemetry">
        <article className="chart-panel">
          <div className="panel-title">
            <BarChart3 size={18} aria-hidden="true" />
            <h2>Usage split</h2>
          </div>
          <div className="split-chart" aria-label="Target usage split: agents versus humans">
            {accessBars.map(([label, value, detail]) => (
              <div className="split-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>{detail}</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${value}%` }} />
                </div>
                <em>{value}%</em>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2>Permission funnel</h2>
          </div>
          <div className="funnel-chart" aria-label="Permission funnel">
            <span style={{ width: "100%" }}>identity</span>
            <span style={{ width: "84%" }}>scope filter</span>
            <span style={{ width: "62%" }}>retrieval</span>
            <span style={{ width: "42%" }}>packed context</span>
          </div>
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <Eye size={18} aria-hidden="true" />
            <h2>Current scope pressure</h2>
          </div>
          <div className="scope-chart" aria-label="Current memory scope chart">
            {scopeBars.map(([label, value]) => (
              <div className="scope-bar" key={label}>
                <span>{label}</span>
                <div>
                  <i style={{ height: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-panel">
          <div className="panel-title">
            <FileSearch size={18} aria-hidden="true" />
            <h2>Session lifecycle</h2>
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

      <section id="memory-graph" className="memory-graph-panel" aria-labelledby="memory-graph-title">
        <div className="memory-graph-header">
          <div className="panel-title">
            <Network size={18} aria-hidden="true" />
            <h2 id="memory-graph-title">Memory graph</h2>
          </div>
          <div className="graph-tools">
            <div className="graph-legend" aria-label="Memory graph legend">
              <span>identity</span>
              <span>memory</span>
              <span>context</span>
              <span>audit</span>
            </div>
            <button className="inline-action" type="button" disabled={busy} onClick={exportObsidianVault}>
              <Network size={16} aria-hidden="true" />
              Export Obsidian vault
            </button>
          </div>
        </div>

        <div className="memory-graph-layout">
          <div className="memory-graph-stage" aria-label="Visual agent memory network">
            <svg className="memory-graph-edges" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
              {memoryGraphEdges.map((edge) => (
                <g
                  className={edge.active ? "memory-edge active" : "memory-edge"}
                  key={`${edge.from}-${edge.to}`}
                >
                  <line
                    x1={edge.fromNode.x}
                    y1={edge.fromNode.y}
                    x2={edge.toNode.x}
                    y2={edge.toNode.y}
                  />
                  <text
                    x={(edge.fromNode.x + edge.toNode.x) / 2}
                    y={(edge.fromNode.y + edge.toNode.y) / 2}
                  >
                    {edge.label}
                  </text>
                </g>
              ))}
            </svg>

            {memoryGraphNodes.map((node) => (
              <button
                className={[
                  "memory-graph-node",
                  node.kind,
                  node.active ? "active" : "",
                  selectedGraphNode.id === node.id ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={node.id}
                onClick={() => setSelectedGraphNodeId(node.id)}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                type="button"
              >
                <span>{node.label}</span>
                <strong>{node.title}</strong>
                <em>{node.status}</em>
              </button>
            ))}
          </div>

          <aside className="memory-inspector" aria-label="Selected memory graph detail">
            <span className="inspector-kicker">{selectedGraphNode.label}</span>
            <h3>{selectedGraphNode.title}</h3>
            <p>{selectedGraphNode.detail}</p>
            <dl>
              <div>
                <dt>Who</dt>
                <dd>{selectedGraphNode.owner}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{selectedGraphNode.location}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{selectedGraphNode.access}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedGraphNode.status}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

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
        <form onSubmit={createAgent}>
          <label>
            Admin token for real API key creation
            <input
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              type="password"
              placeholder="optional in local dev"
            />
          </label>
          <div className="form-row">
            <label>
              Agent ID
              <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
            </label>
            <label>
              Org ID
              <input value={orgId} onChange={(event) => setOrgId(event.target.value)} />
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
          <button type="submit" disabled={busy}>
            <PackageCheck size={16} aria-hidden="true" />
            {adminToken.trim() ? "Create agent key" : "Use dev identity"}
          </button>
        </form>
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
            <textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={5} />
          </label>
          <button type="submit" disabled={busy}>
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
          <button type="submit" disabled={busy || !memoryId}>
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
          <button type="submit" disabled={busy}>
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
    "x-energon-org-id": orgId,
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

function compactText(value: string, maxLength: number) {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  if (cleanValue.length <= maxLength) return cleanValue;
  return `${cleanValue.slice(0, maxLength - 1).trim()}...`;
}
