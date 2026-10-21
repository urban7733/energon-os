"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Moon, Play, RefreshCcw, Save } from "lucide-react";
import { TrainingView, type TrainingData } from "../../components/dashboard/training-view";

type TrainingKind = "adapter" | "compiled";

type TrainingConfig = {
  enabled: boolean;
  kind: TrainingKind;
  base_model: string;
  suite: string;
  min_new_runs: number;
  schedule_hour_utc: number;
  min_lift_pts: number;
};

type TrainingJob = {
  job_id: string;
  status: "queued" | "dispatched" | "running" | "succeeded" | "failed" | "rejected";
  trigger: "schedule" | "operator";
  run_count: number;
  error: string | null;
  created_at_unix_ms: number;
  updated_at_unix_ms: number;
};

type TrainingVersion = {
  version_id: string;
  number: number;
  kind: TrainingKind;
  base_model: string;
  lift_pts: number;
  status: "live" | "shipped" | "rejected";
  trained_on_runs: number;
  decision: string;
  created_at_unix_ms: number;
  eval: { base_success: number; candidate_success: number };
};

type TrainingOverview = {
  config: TrainingConfig & { org_id: string; agent_id: string };
  config_saved: boolean;
  runs_total: number;
  runs_successful: number;
  runs_since_last_job: number;
  jobs: TrainingJob[];
  versions: TrainingVersion[];
};

type ManagementFetch = (path: string, init?: RequestInit) => Promise<unknown>;

const ACTIVE = new Set(["queued", "dispatched", "running"]);

export function TrainingPanel({
  orgId,
  agents,
  managementFetch,
}: {
  orgId: string;
  agents: Array<{ agent_id: string; name: string }>;
  managementFetch: ManagementFetch;
}) {
  const [agentId, setAgentId] = useState("");
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [config, setConfig] = useState<TrainingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // The console recreates its fetch helper on every render; keep loads stable.
  const fetchRef = useRef(managementFetch);
  fetchRef.current = managementFetch;
  const request = useCallback((path: string, init?: RequestInit) => fetchRef.current(path, init), []);

  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].agent_id);
  }, [agentId, agents]);

  const base = orgId && agentId ? `/v1/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/training` : "";

  const load = useCallback(async () => {
    if (!base) return;
    const body = (await request(base)) as TrainingOverview;
    setOverview(body);
    setConfig(body.config);
  }, [base, request]);

  useEffect(() => {
    setOverview(null);
    setConfig(null);
    setNotice(null);
    load().catch((error) => setNotice({ tone: "error", text: message(error) }));
  }, [load]);

  async function act(action: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ tone: "ok", text: await action() });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: message(error) });
    } finally {
      setBusy(false);
    }
  }

  function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    void act(async () => {
      await request(`${base}/config`, { method: "PUT", body: JSON.stringify(config) });
      return config.enabled ? `Nightly training enabled at ${config.schedule_hour_utc}:00 UTC.` : "Training settings saved.";
    });
  }

  const activeJob = overview?.jobs.find((job) => ACTIVE.has(job.status));

  return (
    <section id="training" className="ops-panel wide training-panel" aria-labelledby="training-title">
      <div className="panel-title">
        <Moon size={18} aria-hidden="true" />
        <h2 id="training-title">Nightly training</h2>
      </div>
      <p className="panel-copy">
        Agents report runs during the day. At night Energon trains a new version, tests it on held-out tasks and
        only releases it if it measurably beats the live one.
      </p>

      {agents.length === 0 ? (
        <div className="empty-operator-state">
          <Moon size={18} aria-hidden="true" />
          <p>Create an agent first. Training is configured per agent.</p>
        </div>
      ) : (
        <>
          <div className="form-row training-toolbar">
            <label>
              Agent
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                {agents.map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.name || agent.agent_id}
                  </option>
                ))}
              </select>
            </label>
            <div className="training-actions">
              <button type="button" disabled={busy || !overview} onClick={() => void act(async () => { await load(); return "Refreshed."; })}>
                <RefreshCcw size={14} aria-hidden="true" /> Refresh
              </button>
              <button
                type="button"
                disabled={busy || !overview || Boolean(activeJob)}
                onClick={() =>
                  void act(async () => {
                    await request(`${base}/jobs`, { method: "POST" });
                    return "Training job queued. The worker dispatches it within a minute.";
                  })
                }
              >
                <Play size={14} aria-hidden="true" /> {activeJob ? `Job ${activeJob.status}` : "Train now"}
              </button>
            </div>
          </div>

          {overview ? (
            <dl className="training-stats">
              <div>
                <dt>Runs reported</dt>
                <dd>{overview.runs_total.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Successful</dt>
                <dd>{overview.runs_successful.toLocaleString()}</dd>
              </div>
              <div>
                <dt>New since last job</dt>
                <dd>{overview.runs_since_last_job.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Versions</dt>
                <dd>{overview.versions.length}</dd>
              </div>
            </dl>
          ) : null}

          {notice ? <p className={notice.tone === "error" ? "auth-error" : "training-notice"}>{notice.text}</p> : null}

          {overview && overview.versions.length > 0 ? (
            <TrainingView
              data={toTrainingData(agentId, overview)}
              busy={busy}
              onRollback={(versionId) =>
                void act(async () => {
                  await request(`${base}/versions/${encodeURIComponent(versionId)}/rollback`, { method: "POST" });
                  return "Version is live again.";
                })
              }
            />
          ) : overview ? (
            <div className="empty-operator-state">
              <Moon size={18} aria-hidden="true" />
              <p>
                No versions yet. Report runs with <code>energon.runs.report()</code>, then train now or enable the
                nightly schedule below.
              </p>
            </div>
          ) : null}

          {config ? (
            <form className="training-config" onSubmit={saveConfig}>
              <div className="form-row">
                <label className="policy-checkbox">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
                  />
                  Train every night
                </label>
              </div>
              <div className="form-row">
                <label>
                  Learn as
                  <select value={config.kind} onChange={(event) => setConfig({ ...config, kind: event.target.value as TrainingKind })}>
                    <option value="compiled">compiled instructions (any model)</option>
                    <option value="adapter">LoRA adapter (open-weight model)</option>
                  </select>
                </label>
                <label>
                  Base model
                  <input value={config.base_model} onChange={(event) => setConfig({ ...config, base_model: event.target.value })} />
                </label>
                <label>
                  Eval suite
                  <input value={config.suite} onChange={(event) => setConfig({ ...config, suite: event.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Hour (UTC)
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={config.schedule_hour_utc}
                    onChange={(event) => setConfig({ ...config, schedule_hour_utc: Number(event.target.value) })}
                  />
                </label>
                <label>
                  New successful runs needed
                  <input
                    type="number"
                    min={1}
                    value={config.min_new_runs}
                    onChange={(event) => setConfig({ ...config, min_new_runs: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Minimum lift (points)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={config.min_lift_pts}
                    onChange={(event) => setConfig({ ...config, min_lift_pts: Number(event.target.value) })}
                  />
                </label>
              </div>
              <button type="submit" disabled={busy}>
                <Save size={16} aria-hidden="true" /> Save training settings
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

function toTrainingData(agentId: string, overview: TrainingOverview): TrainingData {
  const versions = [...overview.versions].sort((a, b) => a.number - b.number);
  const latestJob = overview.jobs[0];
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return {
    agent: agentId,
    model: overview.config.base_model,
    runsThisWeek: overview.runs_total,
    runsLabel: "Runs reported",
    nights: versions.map((version) => ({
      night: `v${version.number}`,
      base: Math.round(version.eval.base_success * 100),
      trained: Math.round(version.eval.candidate_success * 100),
    })),
    versions: [...versions].reverse().map((version) => ({
      id: version.version_id,
      version: `v${version.number}`,
      night: new Date(version.created_at_unix_ms).toLocaleDateString(),
      kind: version.kind,
      lift: version.lift_pts,
      status: version.status,
      runs: version.trained_on_runs,
    })),
    lastNight: latestJob
      ? [
          { time: time(latestJob.created_at_unix_ms), label: "Queued", detail: `${latestJob.trigger} · ${latestJob.run_count} runs` },
          {
            time: time(latestJob.updated_at_unix_ms),
            label: latestJob.status[0].toUpperCase() + latestJob.status.slice(1),
            detail: latestJob.error ?? overview.versions.find((v) => v.status === "live")?.decision ?? "",
          },
        ]
      : [],
  };
}

function message(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}
