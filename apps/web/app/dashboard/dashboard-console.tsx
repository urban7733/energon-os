"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Coins,
  Copy,
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
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { authClient, fetchApiToken } from "@/lib/auth-client";
import { site } from "@/lib/site";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const MEMORY_SCOPES: MemoryScope[] = [
  "agent_private",
  "project",
  "org",
  "open",
  "role",
  "session",
  "user_private",
];

const SHARED_SCOPES: SharedMemoryScope[] = ["project", "org", "role", "open"];

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
  const [memoryScopeFilter, setMemoryScopeFilter] = useState<"all" | MemoryScope>("all");
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ApiResult>({
    label: "Ready",
    body: { status: "Waiting for an action", apiBaseUrl: site.apiBaseUrl },
  });
  const [apiStatus, setApiStatus] = useState<"unchecked" | "online" | "offline">("unchecked");
  const [x402Status, setX402Status] = useState<"unchecked" | "enabled" | "disabled" | "offline">(
    "unchecked",
  );
  const [busy, setBusy] = useState(false);

  const cleanBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);
  const orgId = activeOrganization?.id ?? "";
  const authMode = agentApiKey.trim() ? "bearer api key" : "dev identity headers";

  function refreshAnalytics() {
    router.refresh();
  }

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const body = await action();
      setResult({ label, body });
      if (isContextPack(body)) setRequestId(body.request_id);
      toast.success(label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ label: `${label} failed`, body: message });
      toast.error(`${label} failed`, { description: message.slice(0, 160) });
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
    if (!orgId) throw new Error("Create or select an organization first.");
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

  async function checkHealth() {
    setBusy(true);
    try {
      const response = await fetch(`${cleanBaseUrl}/health`);
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      setApiStatus("online");
      setResult({ label: "API health", body });
      toast.success("API online");
    } catch (error) {
      setApiStatus("offline");
      const message = error instanceof Error ? `${error.message}. Start the API on ${cleanBaseUrl}.` : String(error);
      setResult({ label: "API health failed", body: message });
      toast.error("API offline", { description: message.slice(0, 160) });
    } finally {
      setBusy(false);
    }
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Created agent + API key", async () => {
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
        setCopied(false);
      }
      await refreshAgents();
      refreshAnalytics();
      return body;
    });
  }

  async function refreshAgents() {
    const org = requireOrg();
    const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/agents`);
    if (isAgentList(body)) setOrgAgents(body.agents);
    return body;
  }

  async function listAgents() {
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
        setCopied(false);
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
    if (memoryScopeFilter !== "all") query.set("scope", memoryScopeFilter);
    const body = await managementFetch(`/v1/orgs/${encodeURIComponent(org)}/memories?${query.toString()}`);
    if (isMemoryList(body)) setOrgMemories(body.memories);
    return body;
  }

  async function listOrgMemories() {
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
      toast.success(`x402 ${Boolean(body.enabled) ? "enabled" : "disabled"}`);
    } catch (error) {
      setX402Status("offline");
      const message = error instanceof Error ? `${error.message}. Start the API on ${cleanBaseUrl}.` : String(error);
      setResult({ label: "x402 status failed", body: message });
      toast.error("x402 check failed", { description: message.slice(0, 160) });
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
          tags: [],
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
        body: JSON.stringify({ task, project_id: projectId, token_budget: 6000 }),
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

  async function copyKey() {
    if (!mintedKey) return;
    try {
      await navigator.clipboard.writeText(mintedKey);
      setCopied(true);
      toast.success("API key copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — copy it manually");
    }
  }

  const statusTone: Record<string, string> = {
    online: "bg-emerald-400",
    enabled: "bg-emerald-400",
    offline: "bg-red-400",
    disabled: "bg-muted-foreground",
    unchecked: "bg-muted-foreground/50",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              signed in as <span className="font-medium text-foreground">{userEmail}</span>
            </span>
            <Separator orientation="vertical" className="!h-4" />
            <Badge variant="outline" className="gap-1.5 font-normal">
              <span className={`size-1.5 rounded-full ${statusTone[apiStatus]}`} />
              api {apiStatus}
            </Badge>
            <Badge variant="outline" className="gap-1.5 font-normal">
              <span className={`size-1.5 rounded-full ${statusTone[x402Status]}`} />
              x402 {x402Status}
            </Badge>
            <Badge variant="secondary" className="font-normal">{authMode}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={orgId} onValueChange={(value) => void setActiveOrganization(value)}>
              <SelectTrigger size="sm" className="min-w-44">
                <SelectValue placeholder="no active org" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(organizations ?? []).map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void checkHealth()} disabled={busy}>
              <Gauge /> Health
            </Button>
            <Button variant="outline" size="sm" onClick={() => void checkX402()} disabled={busy}>
              <Coins /> x402
            </Button>
            <Button variant="outline" size="sm" onClick={() => void readUsage()} disabled={busy || !orgId}>
              <BarChart3 /> Usage
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Create agent + API key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" /> Agent access
            </CardTitle>
            <CardDescription>Register an agent and mint its bearer API key.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="apiBaseUrl">API base URL</Label>
                <Input
                  id="apiBaseUrl"
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => void checkHealth()} disabled={busy}>
                <Gauge /> Check health
              </Button>
            </div>

            <form onSubmit={createOrganization} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="newOrgName">New organization</Label>
                <Input
                  id="newOrgName"
                  value={newOrgName}
                  onChange={(event) => setNewOrgName(event.target.value)}
                  placeholder="acme swarm"
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy || !newOrgName.trim()}>
                <Users /> Create org
              </Button>
            </form>

            <Separator />

            <form onSubmit={createAgent} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="agentId">Agent ID</Label>
                  <Input
                    id="agentId"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    placeholder="unique agent id"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="orgIdField">Org ID (active)</Label>
                  <Input id="orgIdField" value={orgId} readOnly placeholder="create an org first" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="roleId">Role</Label>
                  <Input
                    id="roleId"
                    value={roleId}
                    onChange={(event) => setRoleId(event.target.value)}
                    placeholder="optional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="projectId">Project</Label>
                  <Input
                    id="projectId"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    placeholder="optional"
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="lg"
                className="shimmer-cta w-full"
                disabled={busy || !orgId || !agentId.trim()}
              >
                {busy ? <Spinner /> : <Sparkles />}
                Create API key
              </Button>
            </form>

            {mintedKey ? (
              <div className="key-reveal flex flex-col gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium tracking-wide text-emerald-300 uppercase">
                    API key — shown once
                  </span>
                  <Button variant="ghost" size="xs" onClick={() => void copyKey()}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <code className="font-mono text-xs break-all text-foreground">{mintedKey}</code>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Agents and keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-muted-foreground" /> Org agents &amp; keys
            </CardTitle>
            <CardDescription>Rotate or revoke keys for agents in the active org.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" onClick={() => void listAgents()} disabled={busy || !orgId} className="w-fit">
              <RefreshCcw /> List agents
            </Button>
            {orgAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents loaded yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {orgAgents.map((agent) => {
                  const activeKeys = agent.keys.filter((key) => key.revoked_at_unix_ms === null).length;
                  return (
                    <div
                      key={agent.agent_id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">{agent.agent_id}</span>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Badge variant="secondary" className="font-normal">{activeKeys} active</Badge>
                          {agent.role_id ? (
                            <Badge variant="outline" className="font-normal">{agent.role_id}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void rotateKey(agent.agent_id)}
                        disabled={busy}
                      >
                        <RefreshCcw /> Rotate
                      </Button>
                    </div>
                  );
                })}
                {orgAgents.some((agent) => agent.keys.length > 0) ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {orgAgents.flatMap((agent) =>
                      agent.keys.map((key) => (
                        <div
                          key={key.api_key_id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                        >
                          <span className="truncate font-mono text-xs text-muted-foreground">{key.api_key_id}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={key.revoked_at_unix_ms === null ? "secondary" : "outline"}
                              className="font-normal"
                            >
                              {key.revoked_at_unix_ms === null ? "active" : "revoked"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Revoke key"
                              disabled={busy || key.revoked_at_unix_ms !== null}
                              onClick={() => void revokeKey(key.api_key_id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      )),
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Write + promote memory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" /> Memory
            </CardTitle>
            <CardDescription>Write agent memory and promote private memory to shared scopes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={writeMemory} className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="agentApiKey">Agent API key</Label>
                <Input
                  id="agentApiKey"
                  type="password"
                  value={agentApiKey}
                  onChange={(event) => setAgentApiKey(event.target.value)}
                  placeholder="empty uses dev identity headers"
                />
              </div>
              <div className="grid gap-2">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={(value) => setScope(value as MemoryScope)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MEMORY_SCOPES.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="memory">Memory</Label>
                <Textarea
                  id="memory"
                  value={memory}
                  onChange={(event) => setMemory(event.target.value)}
                  rows={4}
                  placeholder="memory content to store for this agent"
                />
              </div>
              <Button type="submit" disabled={busy || !memory.trim()} className="w-fit">
                <Send /> Write memory
              </Button>
            </form>

            <Separator />

            <form onSubmit={promoteMemory} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="memoryId">Source memory ID</Label>
                  <Input
                    id="memoryId"
                    value={memoryId}
                    onChange={(event) => setMemoryId(event.target.value)}
                    placeholder="mem_..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Target scope</Label>
                  <Select
                    value={promotionTargetScope}
                    onValueChange={(value) => setPromotionTargetScope(value as SharedMemoryScope)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SHARED_SCOPES.map((value) => (
                          <SelectItem key={value} value={value}>{value}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="promotionReason">Promotion reason</Label>
                <Textarea
                  id="promotionReason"
                  value={promotionReason}
                  onChange={(event) => setPromotionReason(event.target.value)}
                  rows={2}
                  placeholder="why this memory can be shared"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                disabled={busy || !memoryId || !promotionReason.trim()}
                className="w-fit"
              >
                <ArrowUpRight /> Promote private memory
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Build context + audit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4 text-muted-foreground" /> Context &amp; audit
            </CardTitle>
            <CardDescription>Build a context pack and inspect its audit trail.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={buildContext} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="task">Task</Label>
                <Input
                  id="task"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="task the agent needs context for"
                />
              </div>
              <Button type="submit" disabled={busy || !task.trim()}>
                <ShieldCheck /> Build context
              </Button>
            </form>

            <Separator />

            <form onSubmit={readAudit} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="requestId">Request ID</Label>
                <Input
                  id="requestId"
                  value={requestId}
                  onChange={(event) => setRequestId(event.target.value)}
                  placeholder="ctx_..."
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy || !requestId}>
                <KeyRound /> Read audit
              </Button>
            </form>

            <form onSubmit={readPromotionAudit} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="promotedMemoryId">Promoted memory ID</Label>
                <Input
                  id="promotedMemoryId"
                  value={promotedMemoryId}
                  onChange={(event) => setPromotedMemoryId(event.target.value)}
                  placeholder="mem_..."
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy || !promotedMemoryId}>
                <FileSearch /> Promotion audit
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Org memories */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" /> Org memories
            </CardTitle>
            <CardDescription>Browse and delete memory records in the active organization.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label>Scope filter</Label>
                <Select
                  value={memoryScopeFilter}
                  onValueChange={(value) => setMemoryScopeFilter(value as "all" | MemoryScope)}
                >
                  <SelectTrigger className="min-w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">all scopes</SelectItem>
                      {MEMORY_SCOPES.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => void listOrgMemories()} disabled={busy || !orgId}>
                <RefreshCcw /> List memories
              </Button>
            </div>
            {orgMemories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No memories loaded yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orgMemories.map((entry) => (
                  <div
                    key={entry.memory_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">{entry.content_preview}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{entry.memory_id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">{entry.scope}</Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete memory"
                        disabled={busy}
                        onClick={() => void deleteOrgMemory(entry.memory_id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
              <FileSearch className="size-4 text-muted-foreground" /> {result.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72 rounded-md border border-border bg-background">
              <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
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
