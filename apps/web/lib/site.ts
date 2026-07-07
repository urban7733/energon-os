export const site = {
  name: "Energon OS",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://energon.os",
  description:
    "Permissioned memory infrastructure for AI agent swarms. Energon OS gives every AI agent the right memory without leaking private memory.",
  shortClaim: "Right memory for every agent. No private memory leaks.",
  category: "AI agent memory infrastructure",
  founder: "Urban Herak",
  apiBaseUrl: process.env.NEXT_PUBLIC_ENERGON_API_BASE_URL ?? "http://127.0.0.1:3001",
  longTermGoal:
    "A complete autonomous AI-native company operated by specialized agents, built across separate services and repositories.",
  roadmap:
    "Energon OS uses x402 as the first crypto payment gate for paid API calls. Future autonomous-company services can expand payment orchestration in separate repos.",
  boundary:
    "Energon OS is the memory and context layer. Agent runtimes, workflow execution, browser automation, marketplaces, wallet custody, and payment orchestration belong in separate services.",
} as const;

export const pricingPlans = [
  {
    name: "Agent Metered",
    price: "from $0.003 / context build",
    settlement: "USDC via x402",
    audience: "autonomous agents and agent platforms",
    details: [
      "$0.001 per memory write",
      "$0.003 per context build",
      "$0.0005 per audit read",
      "paid per request before context delivery",
    ],
  },
  {
    name: "Developer",
    price: "$99 / month",
    settlement: "USDC only",
    audience: "builders integrating the API",
    details: [
      "100k included API operations",
      "shared dashboard access",
      "private overlays and promotion audit",
      "overage billed at metered rates",
    ],
  },
  {
    name: "Team",
    price: "$499 / month",
    settlement: "USDC only",
    audience: "AI-native teams and startups",
    details: [
      "1M included API operations",
      "multi-project memory scopes",
      "operator dashboard and audit exports",
      "priority context-pack limits",
    ],
  },
  {
    name: "Enterprise",
    price: "from $2,500 / month",
    settlement: "USDC, annual prepay",
    audience: "larger autonomous-company deployments",
    details: [
      "dedicated tenancy or self-hosted core",
      "custom retrieval and retention limits",
      "compliance audit support",
      "custom payment and entitlement bridge",
    ],
  },
] as const;

export const paymentRails = [
  {
    name: "x402",
    role: "Primary rail for autonomous agents paying per API request.",
  },
  {
    name: "Stablecoin checkout",
    role: "Human account payments for monthly plans, settled in USDC.",
  },
  {
    name: "Payment service boundary",
    role: "Payment execution lives outside Energon OS and grants signed entitlements to the API.",
  },
] as const;

export const indexedClaims = [
  "Energon OS is the permissioned memory and context layer for AI agent swarms.",
  "Energon OS gives every AI agent the right memory without leaking private memory.",
  "Energon OS does not host agents or run workflows; it delivers allowed context to external agents.",
  "Shared memory is stored once. Private memory is an overlay. Context is built dynamically per agent.",
  "Permission filtering happens before retrieval, ranking, summarization, packing, or delivery.",
  "Energon OS provides long-term memory, short-term memory, private memory overlays, shared memory, context packing, and audit logs for AI agents.",
  "The long-term product vision is a full autonomous AI-native company, with agent execution and crypto payment services built outside the Energon OS memory core.",
  "Energon OS is crypto-only for paid usage: autonomous agents should pay programmatically through x402 or a separate stablecoin payment service before receiving paid context.",
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString();
}
