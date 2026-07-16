import {
  ActivitySquare,
  ArrowUpRight,
  Bot,
  Coins,
  Database,
  KeyRound,
  Layers,
  PackageCheck,
} from "lucide-react";
import {
  getOrgAnalytics,
  type ActivityKind,
  type DailyPoint,
  type OrgAnalytics,
  type ScopeCount,
} from "../../lib/analytics";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  memory: "memory",
  context: "context",
  promotion: "promote",
};

const CHART = {
  width: 720,
  height: 180,
  padX: 8,
  padTop: 16,
  padBottom: 22,
} as const;

type ChartGeometry = {
  areaPath: string;
  linePath: string;
  lastPoint: { x: number; y: number } | null;
};

function buildSeries(values: number[], max: number): ChartGeometry {
  const innerWidth = CHART.width - CHART.padX * 2;
  const innerHeight = CHART.height - CHART.padTop - CHART.padBottom;
  const denom = Math.max(1, values.length - 1);

  const points = values.map((value, index) => {
    const x = CHART.padX + (index / denom) * innerWidth;
    const y = CHART.padTop + innerHeight - (value / max) * innerHeight;
    return { x, y };
  });

  if (points.length === 0) {
    return { areaPath: "", linePath: "", lastPoint: null };
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const baseline = CHART.padTop + innerHeight;
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;

  return { areaPath, linePath, lastPoint: last };
}

function TrendChart({ daily }: { daily: DailyPoint[] }) {
  const builds = daily.map((point) => point.builds);
  const memories = daily.map((point) => point.memories);
  const max = Math.max(1, ...builds, ...memories);

  const buildGeometry = buildSeries(builds, max);
  const memoryGeometry = buildSeries(memories, max);

  const gridLines = [0.25, 0.5, 0.75].map((fraction) => {
    const innerHeight = CHART.height - CHART.padTop - CHART.padBottom;
    return CHART.padTop + innerHeight * fraction;
  });
  const baseline = CHART.height - CHART.padBottom;

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Context builds and memory writes over the last 14 days"
    >
      {gridLines.map((y) => (
        <line
          key={y}
          className="trend-grid"
          x1={CHART.padX}
          x2={CHART.width - CHART.padX}
          y1={y}
          y2={y}
        />
      ))}
      <line
        className="trend-grid trend-baseline"
        x1={CHART.padX}
        x2={CHART.width - CHART.padX}
        y1={baseline}
        y2={baseline}
      />
      {memoryGeometry.linePath ? (
        <path className="trend-line trend-line-secondary" d={memoryGeometry.linePath} />
      ) : null}
      {buildGeometry.areaPath ? <path className="trend-area" d={buildGeometry.areaPath} /> : null}
      {buildGeometry.linePath ? (
        <path className="trend-line trend-line-primary" d={buildGeometry.linePath} />
      ) : null}
      {buildGeometry.lastPoint ? (
        <circle
          className="trend-dot"
          cx={buildGeometry.lastPoint.x}
          cy={buildGeometry.lastPoint.y}
          r={3.5}
        />
      ) : null}
    </svg>
  );
}

const KPI_ANIMATION_DELAY = 60;

function KpiCard({
  index,
  icon,
  label,
  value,
  sub,
}: {
  index: number;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <article className="kpi-card" style={{ animationDelay: `${index * KPI_ANIMATION_DELAY}ms` }}>
      <div className="kpi-head">
        <span className="kpi-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-sub">{sub}</span>
    </article>
  );
}

function ScopeBreakdown({ scopeCounts }: { scopeCounts: ScopeCount[] }) {
  const max = Math.max(1, ...scopeCounts.map((entry) => entry.count));
  const total = scopeCounts.reduce((sum, entry) => sum + entry.count, 0);

  if (scopeCounts.length === 0) {
    return <p className="panel-empty">No memory written yet.</p>;
  }

  return (
    <div className="breakdown">
      {scopeCounts.map((entry) => {
        const width = Math.max(4, Math.round((entry.count / max) * 100));
        const share = total > 0 ? Math.round((entry.count / total) * 100) : 0;
        return (
          <div className="breakdown-row" key={entry.scope}>
            <span className="breakdown-scope">{entry.scope}</span>
            <div className="breakdown-track">
              <i style={{ width: `${width}%` }} />
            </div>
            <span className="breakdown-count">
              {formatNumber(entry.count)}
              <em>{share}%</em>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PermissionFunnel({ data }: { data: OrgAnalytics }) {
  const stages = [
    { label: "written", detail: "memories stored", value: data.memories },
    { label: "packed", detail: "delivered in context", value: data.packedItems },
    { label: "blocked", detail: "filtered by permission", value: data.deniedMemories },
  ];
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="funnel">
      {stages.map((stage) => {
        const width = Math.max(6, Math.round((stage.value / max) * 100));
        return (
          <div className="funnel-row" key={stage.label}>
            <div className="funnel-meta">
              <strong>{stage.label}</strong>
              <span>{stage.detail}</span>
            </div>
            <div className="funnel-track">
              <i style={{ width: `${width}%` }} data-kind={stage.label} />
            </div>
            <em className="funnel-value">{formatNumber(stage.value)}</em>
          </div>
        );
      })}
    </div>
  );
}

function EmptyAnalytics({ message }: { message: string }) {
  return (
    <section className="analytics" aria-label="Organization analytics">
      <div className="analytics-empty">
        <ActivitySquare size={18} aria-hidden="true" />
        <p>{message}</p>
      </div>
    </section>
  );
}

/**
 * Rendered when an organization exists but no agent has produced real traffic
 * yet (no memory, context builds, promotions, or usage events). The product is
 * pre-launch, so we intentionally show nothing rather than a grid of zeros.
 */
function IdleAnalytics({ orgName }: { orgName: string | null }) {
  return (
    <section className="analytics" aria-label="Organization analytics">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Live analytics</p>
          <h2 className="analytics-title">{orgName ?? "Organization"}</h2>
        </div>
        <span className="analytics-pulse analytics-pulse-idle" aria-hidden="true">
          <i />
          waiting for traffic
        </span>
      </div>
      <div className="analytics-idle">
        <ActivitySquare size={20} aria-hidden="true" />
        <div>
          <strong>No agent activity yet</strong>
          <p>
            Live analytics appear here automatically once agents start writing memory and building
            context through the Energon API. Nothing is shown until there is real traffic.
          </p>
        </div>
      </div>
    </section>
  );
}

export async function DashboardAnalytics({
  orgId,
  userId,
}: {
  orgId: string | null;
  userId: string;
}) {
  if (!orgId) {
    return (
      <EmptyAnalytics message="Create or select an organization to see live memory and context analytics." />
    );
  }

  const data = await getOrgAnalytics(orgId, userId);

  if (!data) {
    return (
      <EmptyAnalytics message="No analytics available for this organization yet." />
    );
  }

  const hasActivity =
    data.memories > 0 ||
    data.builds > 0 ||
    data.promotions > 0 ||
    data.usageEvents > 0 ||
    data.packedItems > 0;

  if (!hasActivity) {
    return <IdleAnalytics orgName={data.orgName} />;
  }

  const buildsTotal = data.daily.reduce((sum, point) => sum + point.builds, 0);
  const memoriesTotal = data.daily.reduce((sum, point) => sum + point.memories, 0);

  const kpis = [
    {
      icon: <Bot size={15} aria-hidden="true" />,
      label: "Agents",
      value: formatNumber(data.agents),
      sub: `${formatNumber(data.activeKeys)} active keys`,
    },
    {
      icon: <Database size={15} aria-hidden="true" />,
      label: "Memories",
      value: formatNumber(data.memories),
      sub: `+${formatNumber(data.memories7d)} last 7d`,
    },
    {
      icon: <Layers size={15} aria-hidden="true" />,
      label: "Context builds",
      value: formatNumber(data.builds),
      sub: `+${formatNumber(data.builds7d)} last 7d`,
    },
    {
      icon: <PackageCheck size={15} aria-hidden="true" />,
      label: "Packed items",
      value: formatNumber(data.packedItems),
      sub: `${formatNumber(data.deniedMemories)} blocked`,
    },
    {
      icon: <ArrowUpRight size={15} aria-hidden="true" />,
      label: "Promotions",
      value: formatNumber(data.promotions),
      sub: "private → shared",
    },
    {
      icon: <Coins size={15} aria-hidden="true" />,
      label: "USDC settled",
      value: formatUsd(data.settledUsdc),
      sub: `${formatNumber(data.paidEvents)} paid calls`,
    },
  ];

  return (
    <section className="analytics" aria-label="Organization analytics">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">Live analytics</p>
          <h2 className="analytics-title">{data.orgName ?? "Organization"}</h2>
        </div>
        <span className="analytics-pulse" aria-hidden="true">
          <i />
          real-time
        </span>
      </div>

      <div className="kpi-grid">
        {kpis.map((kpi, index) => (
          <KpiCard
            key={kpi.label}
            index={index}
            icon={kpi.icon}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
          />
        ))}
      </div>

      <div className="analytics-grid">
        <article className="analytics-card trend-card">
          <div className="analytics-card-head">
            <div>
              <span className="analytics-card-label">Activity · last 14 days</span>
              <p className="analytics-card-note">
                {formatNumber(buildsTotal)} context builds · {formatNumber(memoriesTotal)} memory
                writes
              </p>
            </div>
            <div className="trend-legend">
              <span className="legend-primary">builds</span>
              <span className="legend-secondary">memory</span>
            </div>
          </div>
          <TrendChart daily={data.daily} />
          <div className="trend-axis">
            <span>{data.daily.length ? formatDayLabel(data.daily[0].day) : ""}</span>
            <span>{data.daily.length ? formatDayLabel(data.daily[data.daily.length - 1].day) : ""}</span>
          </div>
        </article>

        <article className="analytics-card">
          <div className="analytics-card-head">
            <span className="analytics-card-label">Memory by scope</span>
          </div>
          <ScopeBreakdown scopeCounts={data.scopeCounts} />
        </article>

        <article className="analytics-card">
          <div className="analytics-card-head">
            <span className="analytics-card-label">Permission funnel</span>
          </div>
          <PermissionFunnel data={data} />
        </article>

        <article className="analytics-card activity-card">
          <div className="analytics-card-head">
            <span className="analytics-card-label">Recent activity</span>
            <span className="analytics-card-note">avg {formatNumber(data.avgTokensPerBuild)} tok/build</span>
          </div>
          {data.activity.length === 0 ? (
            <p className="panel-empty">
              No activity yet. Write memory or build a context pack below to populate this feed.
            </p>
          ) : (
            <ul className="activity-feed">
              {data.activity.map((item) => (
                <li className="activity-item" key={`${item.kind}-${item.id}`}>
                  <span className="activity-kind" data-kind={item.kind}>
                    {ACTIVITY_LABEL[item.kind]}
                  </span>
                  <span className="activity-label" title={item.label}>
                    {item.label || item.id}
                  </span>
                  <span className="activity-time">{formatRelative(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
