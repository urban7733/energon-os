export const demoUsage = [
  { route: "/v1/context/build", calls: 8420, paid_calls: 7640, amount_usdc_micro: 22_920_000 },
  { route: "/v1/memory/write", calls: 6180, paid_calls: 5740, amount_usdc_micro: 5_740_000 },
  { route: "/v1/audit/context", calls: 3420, paid_calls: 2890, amount_usdc_micro: 1_445_000 },
  { route: "/v1/memory/promote", calls: 640, paid_calls: 512, amount_usdc_micro: 512_000 },
  { route: "/v1/agents/register", calls: 280, paid_calls: 280, amount_usdc_micro: 840_000 },
];

export const demoScopes = [
  { scope: "agent_private", count: 1624 },
  { scope: "project", count: 512 },
  { scope: "role", count: 396 },
  { scope: "org", count: 221 },
  { scope: "open", count: 61 },
  { scope: "session", count: 33 },
];

export const demoAgents = [
  { agent_id: "research-01", name: "Research", role_id: "researcher", project_id: "launch" },
  { agent_id: "sales-02", name: "Sales", role_id: "sales", project_id: "launch" },
  { agent_id: "review-01", name: "Reviewer", role_id: "reviewer", project_id: "launch" },
  { agent_id: "ops-01", name: "Operations", role_id: "operator", project_id: "company" },
  { agent_id: "support-03", name: "Support", role_id: "support", project_id: "customer" },
  { agent_id: "finance-01", name: "Finance", role_id: "operator", project_id: "company" },
  { agent_id: "eng-04", name: "Engineering", role_id: "builder", project_id: "platform" },
  { agent_id: "growth-02", name: "Growth", role_id: "sales", project_id: "customer" },
];

export const demoMemories = [
  ["mem-private-01", "agent_private", "Enterprise objection patterns", "launch", "sales", "sales-02"],
  ["mem-private-02", "agent_private", "Unverified competitor note", "launch", "researcher", "research-01"],
  ["mem-project-01", "project", "Launch positioning approved", "launch", null, null],
  ["mem-project-02", "project", "Enterprise rollout plan", "launch", null, null],
  ["mem-role-01", "role", "Reviewer verification policy", null, "reviewer", null],
  ["mem-role-02", "role", "Support escalation playbook", null, "support", null],
  ["mem-org-01", "org", "Enterprise plan supports SSO", null, null, null],
  ["mem-org-02", "org", "Company pricing source-of-truth", null, null, null],
  ["mem-open-01", "open", "Public product boundary", null, null, null],
  ["mem-session-01", "session", "Current pricing investigation", "launch", "researcher", "research-01"],
  ["mem-private-03", "agent_private", "Draft reply to Acme renewal", "customer", "support", "support-03"],
  ["mem-private-04", "agent_private", "Unconfirmed churn signal", "customer", "sales", "growth-02"],
  ["mem-private-05", "agent_private", "Runway model, scenario B", "company", "operator", "finance-01"],
  ["mem-private-06", "agent_private", "Flaky test in context packer", "platform", "builder", "eng-04"],
  ["mem-private-07", "agent_private", "Vendor contract notes", "company", "operator", "ops-01"],
  ["mem-private-08", "agent_private", "Partner intro shortlist", "launch", "sales", "sales-02"],
  ["mem-private-09", "agent_private", "Benchmark raw results", "platform", "builder", "eng-04"],
  ["mem-private-10", "agent_private", "Review checklist v2 draft", "launch", "reviewer", "review-01"],
  ["mem-project-03", "project", "Launch date: second week", "launch", null, null],
  ["mem-project-04", "project", "Customer onboarding flow", "customer", null, null],
  ["mem-project-05", "project", "Platform latency budget 120 ms", "platform", null, null],
  ["mem-project-06", "project", "Q3 hiring plan", "company", null, null],
  ["mem-project-07", "project", "Support SLA: 4 business hours", "customer", null, null],
  ["mem-role-03", "role", "Operator approval thresholds", null, "operator", null],
  ["mem-role-04", "role", "Sales discount guardrails", null, "sales", null],
  ["mem-role-05", "role", "Builder deploy policy", null, "builder", null],
  ["mem-org-03", "org", "Brand voice guidelines", null, null, null],
  ["mem-org-04", "org", "Data retention: 90 days", null, null, null],
  ["mem-open-02", "open", "Public API rate limits", null, null, null],
  ["mem-session-02", "session", "Ticket #4821 context", "customer", "support", "support-03"],
].map(([memory_id, scope, content_preview, project_id, role_id, owner_agent_id], index) => ({
  memory_id: memory_id!,
  scope: scope as "open" | "org" | "project" | "role" | "agent_private" | "user_private" | "session",
  content_preview: content_preview!,
  project_id: project_id ?? null,
  role_id: role_id ?? null,
  owner_agent_id: owner_agent_id ?? null,
  created_at_unix_ms: Date.UTC(2026, 7, 26, 9, index * 2),
}));

export const demoRolePolicies = [
  { role_id: "reviewer", authority_bps: 8500, can_resolve_conflicts: true },
  { role_id: "operator", authority_bps: 9500, can_resolve_conflicts: true },
  { role_id: "researcher", authority_bps: 6200, can_resolve_conflicts: false },
  { role_id: "builder", authority_bps: 7000, can_resolve_conflicts: false },
];

export const demoConflicts = [
  { conflict_id: "conflict-pricing", subject: "enterprise", predicate: "annual_price", status: "contested" as const },
  { conflict_id: "conflict-launch", subject: "launch", predicate: "release_date", status: "contested" as const },
];
