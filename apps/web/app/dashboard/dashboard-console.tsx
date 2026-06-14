"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, PackageCheck, Send, ShieldCheck } from "lucide-react";
import { site } from "../../lib/site";

type ApiResult = {
  label: string;
  body: unknown;
};

type MemoryScope = "open" | "org" | "project" | "role" | "agent_private" | "user_private" | "session";

export function DashboardConsole() {
  const [apiBaseUrl, setApiBaseUrl] = useState(site.apiBaseUrl);
  const [adminToken, setAdminToken] = useState("");
  const [agentApiKey, setAgentApiKey] = useState("");
  const [agentId, setAgentId] = useState("agent_777");
  const [orgId, setOrgId] = useState("org_1");
  const [roleId, setRoleId] = useState("strategist");
  const [projectId, setProjectId] = useState("apex_verify");
  const [scope, setScope] = useState<MemoryScope>("agent_private");
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
  const [busy, setBusy] = useState(false);

  const cleanBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);

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

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function writeMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Wrote memory", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/memory/write`, {
        method: "POST",
        headers: bearerHeaders(agentApiKey),
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
      return body;
    });
  }

  async function buildContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Built context", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/context/build`, {
        method: "POST",
        headers: bearerHeaders(agentApiKey),
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

  async function readAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Read audit", async () => {
      const response = await fetch(`${cleanBaseUrl}/v1/audit/context/${requestId}`, {
        headers: bearerHeaders(agentApiKey),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body;
    });
  }

  return (
    <div className="console-grid">
      <section id="agents" className="ops-panel" aria-labelledby="agents-title">
        <div className="panel-title">
          <KeyRound size={18} aria-hidden="true" />
          <h2 id="agents-title">Agent access</h2>
        </div>
        <form onSubmit={createAgent}>
          <label>
            API base URL
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <label>
            Admin token
            <input
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              type="password"
              placeholder="ENERGON_ADMIN_TOKEN"
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
            Create agent key
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
              placeholder="eos_live_..."
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
      </section>

      <section id="audit" className="result-panel" aria-live="polite" aria-label="API result">
        <div className="panel-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2>{result.label}</h2>
        </div>
        <pre>{JSON.stringify(result.body, null, 2)}</pre>
      </section>
    </div>
  );
}

function bearerHeaders(apiKey: string) {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${apiKey}`,
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

