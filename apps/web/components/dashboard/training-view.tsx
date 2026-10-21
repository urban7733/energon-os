"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, CircleSlash, FileText, Moon, PlugZap } from "lucide-react";

type Night = { night: string; base: number; trained: number };
type Version = {
  id?: string;
  version: string;
  night: string;
  kind: "adapter" | "compiled";
  lift: number;
  status: "live" | "shipped" | "rejected";
  runs: number;
};
type JobStep = { time: string; label: string; detail: string };

export type TrainingData = {
  agent: string;
  model: string;
  nights: Night[];
  versions: Version[];
  lastNight: JobStep[];
  runsThisWeek: number;
  runsLabel?: string;
};

const tooltipStyle = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(12,14,18,0.96)",
  boxShadow: "0 20px 40px -12px rgba(0,0,0,0.8)",
  color: "#f5f7fa",
  fontSize: 12,
  padding: "8px 12px",
};

/** Nightly training overview for one agent: lift over time, versions, last night's job. */
export function TrainingView({
  data,
  onRollback,
  busy = false,
}: {
  data: TrainingData;
  /** Shown for shipped versions when provided (live dashboard only). */
  onRollback?: (versionId: string) => void;
  busy?: boolean;
}) {
  const first = data.nights[0];
  const latest = data.nights[data.nights.length - 1];
  const lift = latest.trained - first.base;
  const live = data.versions.find((version) => version.status === "live");
  const rejected = data.versions.filter((version) => version.status === "rejected").length;
  const values = data.nights.flatMap((night) => [night.base, night.trained]);
  const domain: [number, number] = [
    Math.max(0, Math.floor((Math.min(...values) - 8) / 10) * 10),
    Math.min(100, Math.ceil((Math.max(...values) + 8) / 10) * 10),
  ];

  return (
    <section className="dx-analytics" aria-label={`Training for ${data.agent}`}>
      <div className="dx-kpis">
        <Kpi label="Held-out success" value={`${latest.trained}%`} foot={`from ${first.base}% before training`} />
        <Kpi label="Lift" value={`+${lift}`} unit="pts" foot={`across ${data.nights.length} nights`} accent />
        <Kpi label="Live version" value={live?.version ?? "—"} foot={live ? `${live.kind === "adapter" ? "LoRA adapter" : "compiled instructions"}` : "none yet"} />
        <Kpi label={data.runsLabel ?? "Runs this week"} value={data.runsThisWeek.toLocaleString()} foot="reported via API" />
        <Kpi label="Rejected" value={String(rejected)} foot="versions without lift" />
      </div>

      <div className="dx-tab-grid">
        <article className="dx-card dx-chart">
          <header className="dx-card-head">
            <div>
              <h3>Success rate on held-out tasks</h3>
              <p>
                {data.agent} · {data.model}
              </p>
            </div>
            <span className="dx-pill dx-pill-ok">+{lift} pts</span>
          </header>
          <div className="dx-chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.nights} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="tv-trained" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#b7a6ff" stopOpacity={0.45} />
                    <stop offset="1" stopColor="#b7a6ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="night" stroke="#5b636e" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis domain={domain} stroke="#5b636e" tickLine={false} axisLine={false} fontSize={11} unit="%" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#f5f7fa" }} labelStyle={{ color: "#9aa1ab" }} />
                <Area type="monotone" dataKey="base" name="Base model" stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                <Area type="monotone" dataKey="trained" name="Trained" stroke="#c9bdff" fill="url(#tv-trained)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dx-card dx-aside">
          <span className="dx-aside-icon">
            <Moon size={16} aria-hidden="true" />
          </span>
          <span className="dx-label">Last night</span>
          {data.lastNight.length === 0 ? <p className="dx-muted">No training job has run yet.</p> : null}
          <ol className="tv-job">
            {data.lastNight.map((step) => (
              <li key={step.time}>
                <time>{step.time}</time>
                <span>
                  <strong>{step.label}</strong>
                  <em>{step.detail}</em>
                </span>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <article className="dx-card dx-table-card">
        <div className="dx-table" role="table" aria-label="Training versions">
          <div className="dx-table-head tv-cols" role="row">
            <span role="columnheader">Version</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Trained on</span>
            <span role="columnheader">Held-out lift</span>
            <span role="columnheader">Status</span>
          </div>
          {data.versions.map((version) => (
            <div className="dx-table-row tv-cols" role="row" key={version.version}>
              <span role="cell" className="dx-entity">
                <span className="dx-entity-avatar">
                  {version.kind === "adapter" ? <PlugZap size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
                </span>
                <span>
                  <strong>{version.version}</strong>
                  <small>{version.night}</small>
                </span>
              </span>
              <span role="cell">{version.kind === "adapter" ? "LoRA adapter" : "Compiled instructions"}</span>
              <span role="cell">{version.runs.toLocaleString()} runs</span>
              <span role="cell" className={version.lift > 0 ? "tv-lift is-up" : "tv-lift"}>
                {version.lift > 0 ? `+${version.lift}` : version.lift} pts
              </span>
              <span role="cell">
                {version.status === "rejected" ? (
                  <span className="dx-pill tv-rejected">
                    <CircleSlash size={11} aria-hidden="true" /> rejected
                  </span>
                ) : onRollback && version.status === "shipped" && version.id ? (
                  <button type="button" className="tv-rollback" disabled={busy} onClick={() => onRollback(version.id!)}>
                    Make live
                  </button>
                ) : (
                  <span className={version.status === "live" ? "dx-pill dx-pill-ok" : "dx-pill"}>
                    <CheckCircle2 size={11} aria-hidden="true" /> {version.status}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function Kpi({ label, value, unit, foot, accent }: { label: string; value: string; unit?: string; foot: string; accent?: boolean }) {
  return (
    <article className={accent ? "dx-kpi tv-kpi-accent" : "dx-kpi"}>
      <span className="dx-label">{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <div className="dx-kpi-foot">
        <p>{foot}</p>
      </div>
    </article>
  );
}
