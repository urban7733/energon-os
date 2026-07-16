import { readPool } from "./db";

export type MemoryScope =
  | "open"
  | "org"
  | "project"
  | "role"
  | "agent_private"
  | "user_private"
  | "session";

export type ScopeCount = {
  scope: MemoryScope;
  count: number;
};

export type DailyPoint = {
  /** ISO date (YYYY-MM-DD) at day resolution. */
  day: string;
  builds: number;
  memories: number;
};

export type ActivityKind = "memory" | "context" | "promotion";

export type ActivityItem = {
  kind: ActivityKind;
  id: string;
  label: string;
  createdAt: string;
};

export type OrgAnalytics = {
  orgName: string | null;
  agents: number;
  activeKeys: number;
  revokedKeys: number;
  memories: number;
  memories7d: number;
  builds: number;
  builds7d: number;
  promotions: number;
  usageEvents: number;
  paidEvents: number;
  settledUsdc: number;
  deniedMemories: number;
  packedItems: number;
  avgTokensPerBuild: number;
  scopeCounts: ScopeCount[];
  daily: DailyPoint[];
  activity: ActivityItem[];
};

const SCOPE_ORDER: MemoryScope[] = [
  "open",
  "org",
  "project",
  "role",
  "agent_private",
  "user_private",
  "session",
];

function toInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads org-scoped analytics directly from Postgres. Every query is
 * parameterized and constrained to `orgId`, and the caller's membership in the
 * organization is verified first, so an operator can only ever see aggregates
 * for an org they belong to.
 *
 * Returns `null` when the user is not a member of the org (or it does not
 * exist), which the UI renders as an empty state.
 */
export async function getOrgAnalytics(
  orgId: string,
  userId: string,
): Promise<OrgAnalytics | null> {
  const membership = await readPool.query(
    'SELECT 1 FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
    [orgId, userId],
  );

  if (membership.rowCount === 0) {
    return null;
  }

  const [totals, scopes, daily, activity] = await Promise.all([
    readPool.query(
      `SELECT
         (SELECT name FROM "organization" WHERE id = $1) AS org_name,
         (SELECT count(*) FROM agents WHERE org_id = $1) AS agents,
         (SELECT count(*) FROM agent_api_keys k
            JOIN agents a ON a.agent_id = k.agent_id
            WHERE a.org_id = $1 AND k.revoked_at IS NULL) AS active_keys,
         (SELECT count(*) FROM agent_api_keys k
            JOIN agents a ON a.agent_id = k.agent_id
            WHERE a.org_id = $1 AND k.revoked_at IS NOT NULL) AS revoked_keys,
         (SELECT count(*) FROM memory_entries WHERE org_id = $1) AS memories,
         (SELECT count(*) FROM memory_entries
            WHERE org_id = $1 AND created_at >= now() - interval '7 days') AS memories_7d,
         (SELECT count(*) FROM context_requests WHERE org_id = $1) AS builds,
         (SELECT count(*) FROM context_requests
            WHERE org_id = $1 AND created_at >= now() - interval '7 days') AS builds_7d,
         (SELECT count(*) FROM memory_promotions WHERE org_id = $1) AS promotions,
         (SELECT count(*) FROM usage_events WHERE org_id = $1) AS usage_events,
         (SELECT count(*) FROM usage_events WHERE org_id = $1 AND paid) AS paid_events,
         (SELECT COALESCE(sum(amount_usdc_micro), 0) FROM payment_receipts WHERE org_id = $1) AS settled_micro,
         (SELECT COALESCE(sum(denied_memory_count), 0) FROM context_requests WHERE org_id = $1) AS denied,
         (SELECT COALESCE(round(avg(estimated_tokens)), 0) FROM context_requests WHERE org_id = $1) AS avg_tokens,
         (SELECT count(*) FROM context_request_items i
            JOIN context_requests r ON r.request_id = i.request_id
            WHERE r.org_id = $1) AS packed`,
      [orgId],
    ),
    readPool.query(
      `SELECT scope, count(*) AS count
         FROM memory_entries
         WHERE org_id = $1
         GROUP BY scope`,
      [orgId],
    ),
    readPool.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(b.builds, 0) AS builds,
              COALESCE(m.memories, 0) AS memories
         FROM generate_series(
                (now()::date - interval '13 days'),
                now()::date,
                interval '1 day'
              ) AS d(day)
         LEFT JOIN (
           SELECT created_at::date AS day, count(*) AS builds
             FROM context_requests
             WHERE org_id = $1
             GROUP BY 1
         ) b ON b.day = d.day::date
         LEFT JOIN (
           SELECT created_at::date AS day, count(*) AS memories
             FROM memory_entries
             WHERE org_id = $1
             GROUP BY 1
         ) m ON m.day = d.day::date
         ORDER BY d.day ASC`,
      [orgId],
    ),
    readPool.query(
      `(SELECT 'memory' AS kind, memory_id AS id, scope AS label, created_at
          FROM memory_entries WHERE org_id = $1)
       UNION ALL
       (SELECT 'context' AS kind, request_id AS id, task AS label, created_at
          FROM context_requests WHERE org_id = $1)
       UNION ALL
       (SELECT 'promotion' AS kind, promoted_memory_id AS id, target_scope AS label, created_at
          FROM memory_promotions WHERE org_id = $1)
       ORDER BY created_at DESC
       LIMIT 8`,
      [orgId],
    ),
  ]);

  const totalsRow = totals.rows[0] ?? {};

  const scopeMap = new Map<string, number>();
  for (const row of scopes.rows) {
    scopeMap.set(String(row.scope), toInt(row.count));
  }
  const scopeCounts: ScopeCount[] = SCOPE_ORDER.filter((scope) =>
    scopeMap.has(scope),
  ).map((scope) => ({ scope, count: scopeMap.get(scope) ?? 0 }));

  const dailyPoints: DailyPoint[] = daily.rows.map((row) => ({
    day: String(row.day),
    builds: toInt(row.builds),
    memories: toInt(row.memories),
  }));

  const activityItems: ActivityItem[] = activity.rows.map((row) => ({
    kind: row.kind as ActivityKind,
    id: String(row.id),
    label: String(row.label ?? ""),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }));

  return {
    orgName: totalsRow.org_name ?? null,
    agents: toInt(totalsRow.agents),
    activeKeys: toInt(totalsRow.active_keys),
    revokedKeys: toInt(totalsRow.revoked_keys),
    memories: toInt(totalsRow.memories),
    memories7d: toInt(totalsRow.memories_7d),
    builds: toInt(totalsRow.builds),
    builds7d: toInt(totalsRow.builds_7d),
    promotions: toInt(totalsRow.promotions),
    usageEvents: toInt(totalsRow.usage_events),
    paidEvents: toInt(totalsRow.paid_events),
    settledUsdc: toInt(totalsRow.settled_micro) / 1_000_000,
    deniedMemories: toInt(totalsRow.denied),
    packedItems: toInt(totalsRow.packed),
    avgTokensPerBuild: toInt(totalsRow.avg_tokens),
    scopeCounts,
    daily: dailyPoints,
    activity: activityItems,
  };
}
