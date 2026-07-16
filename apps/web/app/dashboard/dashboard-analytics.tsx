import {
  Activity,
  ArrowUpRight,
  Bot,
  Coins,
  Database,
  Layers,
  PackageCheck,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  getOrgAnalytics,
  type ActivityKind,
  type DailyPoint,
  type OrgAnalytics,
  type ScopeCount,
} from "@/lib/analytics";

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

  const innerHeight = CHART.height - CHART.padTop - CHART.padBottom;
  const gridLines = [0.25, 0.5, 0.75].map((fraction) => CHART.padTop + innerHeight * fraction);
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
        <line key={y} className="trend-grid" x1={CHART.padX} x2={CHART.width - CHART.padX} y1={y} y2={y} />
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
        <circle className="trend-dot" cx={buildGeometry.lastPoint.x} cy={buildGeometry.lastPoint.y} r={3.5} />
      ) : null}
    </svg>
  );
}

function KpiCard({
  index,
  icon: Icon,
  label,
  value,
  sub,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-3 gap-2 py-4 duration-500 transition-colors hover:border-foreground/25"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
    >
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2 text-[11px] tracking-wide uppercase">
          <Icon className="size-3.5 text-foreground" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="px-4">
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </CardFooter>
    </Card>
  );
}

function ScopeBreakdown({ scopeCounts }: { scopeCounts: ScopeCount[] }) {
  const max = Math.max(1, ...scopeCounts.map((entry) => entry.count));
  const total = scopeCounts.reduce((sum, entry) => sum + entry.count, 0);

  if (scopeCounts.length === 0) {
    return <p className="text-sm text-muted-foreground">No memory written yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {scopeCounts.map((entry) => {
        const width = Math.max(4, Math.round((entry.count / max) * 100));
        const share = total > 0 ? Math.round((entry.count / total) * 100) : 0;
        return (
          <div key={entry.scope} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
            <span className="truncate text-xs text-foreground">{entry.scope}</span>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="dash-bar h-full rounded-full bg-foreground" style={{ width: `${width}%` }} />
            </div>
            <span className="flex items-baseline gap-1.5 text-xs tabular-nums text-foreground">
              {formatNumber(entry.count)}
              <span className="text-[10px] text-muted-foreground">{share}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PermissionFunnel({ data }: { data: OrgAnalytics }) {
  const stages = [
    { key: "written", label: "written", detail: "memories stored", value: data.memories },
    { key: "packed", label: "packed", detail: "delivered in context", value: data.packedItems },
    { key: "blocked", label: "blocked", detail: "filtered by permission", value: data.deniedMemories },
  ] as const;
  const max = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage) => {
        const width = Math.max(6, Math.round((stage.value / max) * 100));
        return (
          <div key={stage.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium tracking-wide uppercase text-foreground">
                {stage.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{stage.detail}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={`dash-bar h-full rounded-full ${stage.key === "blocked" ? "dash-bar-hatch" : "bg-foreground"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-sm tabular-nums text-foreground">{formatNumber(stage.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function IdleAnalytics({ orgName }: { orgName: string | null }) {
  return (
    <section className="flex flex-col gap-4" aria-label="Organization analytics">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] tracking-widest uppercase text-muted-foreground">Live analytics</p>
          <h2 className="text-lg font-medium tracking-tight text-foreground">{orgName ?? "Organization"}</h2>
        </div>
        <Badge variant="outline" className="gap-2 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          waiting for traffic
        </Badge>
      </div>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Activity />
          </EmptyMedia>
          <EmptyTitle>No agent activity yet</EmptyTitle>
          <EmptyDescription>
            Live analytics appear here automatically once agents start writing memory and building
            context through the Energon API. Nothing is shown until there is real traffic.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
      <section className="flex flex-col gap-4" aria-label="Organization analytics">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity />
            </EmptyMedia>
            <EmptyTitle>No active organization</EmptyTitle>
            <EmptyDescription>
              Create or select an organization to see live memory and context analytics.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const data = await getOrgAnalytics(orgId, userId);

  if (!data) {
    return <IdleAnalytics orgName={null} />;
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
    { icon: Bot, label: "Agents", value: formatNumber(data.agents), sub: `${formatNumber(data.activeKeys)} active keys` },
    { icon: Database, label: "Memories", value: formatNumber(data.memories), sub: `+${formatNumber(data.memories7d)} last 7d` },
    { icon: Layers, label: "Context builds", value: formatNumber(data.builds), sub: `+${formatNumber(data.builds7d)} last 7d` },
    { icon: PackageCheck, label: "Packed items", value: formatNumber(data.packedItems), sub: `${formatNumber(data.deniedMemories)} blocked` },
    { icon: ArrowUpRight, label: "Promotions", value: formatNumber(data.promotions), sub: "private to shared" },
    { icon: Coins, label: "USDC settled", value: formatUsd(data.settledUsdc), sub: `${formatNumber(data.paidEvents)} paid calls` },
  ];

  return (
    <section className="flex flex-col gap-4" aria-label="Organization analytics">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] tracking-widest uppercase text-muted-foreground">Live analytics</p>
          <h2 className="text-lg font-medium tracking-tight text-foreground">{data.orgName ?? "Organization"}</h2>
        </div>
        <Badge variant="outline" className="gap-2 text-muted-foreground">
          <span className="dash-pulse size-1.5 rounded-full bg-emerald-400" />
          real-time
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Activity</CardTitle>
            <CardDescription>
              {formatNumber(buildsTotal)} context builds · {formatNumber(memoriesTotal)} memory writes ·
              last 14 days
            </CardDescription>
            <CardAction className="flex gap-4 text-[10px] tracking-wide uppercase text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-foreground" />
                builds
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-muted-foreground" />
                memory
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <TrendChart daily={data.daily} />
            <div className="mt-2 flex justify-between text-[10px] tracking-wide uppercase text-muted-foreground">
              <span>{data.daily.length ? formatDayLabel(data.daily[0].day) : ""}</span>
              <span>{data.daily.length ? formatDayLabel(data.daily[data.daily.length - 1].day) : ""}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Memory by scope</CardTitle>
          </CardHeader>
          <CardContent>
            <ScopeBreakdown scopeCounts={data.scopeCounts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Permission funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <PermissionFunnel data={data} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Recent activity</CardTitle>
            <CardAction>
              <Badge variant="secondary" className="tabular-nums">
                avg {formatNumber(data.avgTokensPerBuild)} tok/build
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet. Write memory or build a context pack below to populate this feed.
              </p>
            ) : (
              <ul className="flex flex-col">
                {data.activity.map((item) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                  >
                    <Badge
                      variant={item.kind === "context" ? "default" : "outline"}
                      className="justify-center uppercase"
                    >
                      {ACTIVITY_LABEL[item.kind]}
                    </Badge>
                    <span className="truncate text-sm text-foreground" title={item.label}>
                      {item.label || item.id}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatRelative(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
