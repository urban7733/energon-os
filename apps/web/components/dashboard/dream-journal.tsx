"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Lock, Moon, RefreshCcw, Trash2 } from "lucide-react";

type SharedDream = {
  memory_id: string;
  content: string;
  scope: string;
  tags: string[];
  created_at_unix_ms: number;
  sharing: {
    agent_id: string;
    reason: string;
    target_scope: string;
  } | null;
};

type DreamStats = {
  private_dreams: number;
  shared_dreams: number;
  agents: {
    agent_id: string;
    private_dreams: number;
    shared_dreams: number;
    last_dream_at_unix_ms: number;
  }[];
  shared_tags: { tag: string; dreams: number }[];
};

type DreamJournalProps = {
  orgId: string;
  /** Authenticated operator request against the Energon API. */
  request: (path: string, init?: RequestInit) => Promise<unknown>;
};

const PAGE_SIZE = 20;

/**
 * Operator view of agent dreams. Private reflections belong to their agents,
 * so the API only exposes their counts; shared excerpts are listed in full and
 * can be removed for moderation. Dream text is untrusted agent output and is
 * rendered as plain text only.
 */
export function DreamJournal({ orgId, request }: DreamJournalProps) {
  const [stats, setStats] = useState<DreamStats | null>(null);
  const [dreams, setDreams] = useState<SharedDream[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/v1/orgs/${encodeURIComponent(orgId)}`;

  const loadPage = useCallback(
    async (cursor: string | null) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set("cursor", cursor);
      if (tag.trim()) query.set("tag", tag.trim());
      if (agentFilter) query.set("agent_id", agentFilter);
      const body = await request(`${base}/dreams?${query.toString()}`);
      if (!isDreamPage(body)) throw new Error("Dream journal response was invalid.");
      setDreams((current) => (cursor ? [...current, ...body.dreams] : body.dreams));
      setNextCursor(body.next_cursor);
    },
    [agentFilter, base, request, tag],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await request(`${base}/dream-stats`);
      if (!isDreamStatsResponse(body)) throw new Error("Dream stats response was invalid.");
      setStats(body.stats);
      await loadPage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [base, loadPage, request]);

  useEffect(() => {
    if (!orgId) {
      setStats(null);
      setDreams([]);
      setNextCursor(null);
      return;
    }
    void refresh();
    // Filters apply when the operator submits the form, not on every keystroke.
  }, [orgId]);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refresh();
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      await loadPage(nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function remove(dreamId: string) {
    setLoading(true);
    setError(null);
    try {
      await request(`${base}/dreams/${encodeURIComponent(dreamId)}`, { method: "DELETE" });
      setDreams((current) => current.filter((dream) => dream.memory_id !== dreamId));
      const body = await request(`${base}/dream-stats`);
      if (isDreamStatsResponse(body)) setStats(body.stats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="dreams" className="ops-panel wide dream-journal" aria-labelledby="dreams-title">
      <div className="panel-title">
        <Moon size={18} aria-hidden="true" />
        <h2 id="dreams-title">Dream journal</h2>
      </div>
      <p className="dream-privacy-note">
        <Lock size={13} aria-hidden="true" />
        Private dreams stay with their agents. You see how many exist, never what they say.
        Shared excerpts are speculative and never verified facts.
      </p>

      <div className="dream-stats" aria-label="Dream activity">
        <div className="dream-stat">
          <span>Private dreams</span>
          <strong>{stats?.private_dreams ?? "—"}</strong>
        </div>
        <div className="dream-stat">
          <span>Shared excerpts</span>
          <strong>{stats?.shared_dreams ?? "—"}</strong>
        </div>
        <div className="dream-stat">
          <span>Dreaming agents</span>
          <strong>{stats?.agents.length ?? "—"}</strong>
        </div>
      </div>

      {stats && stats.agents.length > 0 ? (
        <div className="data-table dream-agents" aria-label="Dream activity per agent">
          {stats.agents.map((agent) => (
            <div className="data-table-row" key={agent.agent_id}>
              <strong>{agent.agent_id}</strong>
              <span>{agent.private_dreams} private</span>
              <span>{agent.shared_dreams} shared</span>
              <span>{formatTime(agent.last_dream_at_unix_ms)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={applyFilters}>
        <div className="form-row">
          <label>
            Shared by agent
            <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
              <option value="">all agents</option>
              {(stats?.agents ?? [])
                .filter((agent) => agent.shared_dreams > 0)
                .map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.agent_id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tag
            <input
              value={tag}
              maxLength={64}
              placeholder="any tag"
              onChange={(event) => setTag(event.target.value)}
            />
          </label>
        </div>
        {stats && stats.shared_tags.length > 0 ? (
          <div className="dream-tags" aria-label="Popular shared tags">
            {stats.shared_tags.map(({ tag: name, dreams: count }) => (
              <button
                type="button"
                key={name}
                className={name === tag ? "is-active" : undefined}
                onClick={() => setTag(name === tag ? "" : name)}
              >
                #{name} <em>{count}</em>
              </button>
            ))}
          </div>
        ) : null}
        <button type="submit" disabled={loading || !orgId}>
          <RefreshCcw size={16} aria-hidden="true" />
          Refresh dreams
        </button>
      </form>

      {error ? <p className="auth-error">{error}</p> : null}

      {dreams.length > 0 ? (
        <ol className="dream-list" aria-label="Shared dreams">
          {dreams.map((dream) => (
            <li key={dream.memory_id}>
              <p>{dream.content}</p>
              <div className="dream-meta">
                <span>{dream.sharing?.agent_id ?? "unknown agent"}</span>
                <span>{dream.scope}</span>
                <span>{formatTime(dream.created_at_unix_ms)}</span>
                {dream.tags.map((name) => (
                  <span key={name}>#{name}</span>
                ))}
              </div>
              {dream.sharing?.reason ? <p className="dream-reason">Why shared: {dream.sharing.reason}</p> : null}
              <button type="button" disabled={loading} onClick={() => void remove(dream.memory_id)}>
                <Trash2 size={14} aria-hidden="true" />
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : stats ? (
        <p className="dream-empty">No shared dreams match these filters yet.</p>
      ) : null}

      {nextCursor ? (
        <button type="button" className="dream-more" disabled={loading} onClick={() => void loadMore()}>
          Load older dreams
        </button>
      ) : null}
    </section>
  );
}

function formatTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isDreamPage(value: unknown): value is { dreams: SharedDream[]; next_cursor: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const page = value as { dreams?: unknown; next_cursor?: unknown };
  return (
    Array.isArray(page.dreams) &&
    page.dreams.every(isSharedDream) &&
    (page.next_cursor === null || typeof page.next_cursor === "string")
  );
}

function isSharedDream(value: unknown): value is SharedDream {
  if (typeof value !== "object" || value === null) return false;
  const dream = value as Partial<SharedDream>;
  return (
    typeof dream.memory_id === "string" &&
    typeof dream.content === "string" &&
    typeof dream.scope === "string" &&
    Array.isArray(dream.tags) &&
    typeof dream.created_at_unix_ms === "number"
  );
}

function isDreamStatsResponse(value: unknown): value is { stats: DreamStats } {
  if (typeof value !== "object" || value === null) return false;
  const stats = (value as { stats?: Partial<DreamStats> }).stats;
  return (
    typeof stats === "object" &&
    stats !== null &&
    typeof stats.private_dreams === "number" &&
    typeof stats.shared_dreams === "number" &&
    Array.isArray(stats.agents) &&
    Array.isArray(stats.shared_tags)
  );
}
