export const site = {
  name: "Energon OS",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://energon-os.pages.dev",
  repositoryUrl: "https://github.com/urban7733/energon-os",
  documentationUrl: "https://github.com/urban7733/energon-os/tree/main/docs",
  apiDocumentationUrl: "https://github.com/urban7733/energon-os/blob/main/docs/api.md",
  architectureDocumentationUrl: "https://github.com/urban7733/energon-os/blob/main/docs/architecture.md",
  description:
    "Your agents learn while they sleep. Energon turns your agents' daily runs into nightly training: trained adapters for open models, compiled instructions for closed ones, measured on held-out tasks.",
  shortClaim: "Your agents learn while they sleep.",
  category: "AI agent training infrastructure",
  founder: "Urban Herak",
  apiBaseUrl: process.env.NEXT_PUBLIC_ENERGON_API_BASE_URL ?? "http://127.0.0.1:3001",
  longTermGoal:
    "Build one of the world's first complete AI-autonomous companies, operated by specialized agents across separate services and repositories.",
  companyStackNote:
    "Energon manages memory access. You keep control of your agents, workflows, and decisions.",
  productBoundary:
    "We do not run your agents or workflows. Energon only controls which saved memories each agent may use.",
  roadmap:
    "Energon OS uses x402 as the first crypto payment gate for paid API calls. Future autonomous-company services can expand payment orchestration in separate repos.",
  boundary:
    "Energon OS is the memory and context layer. Agent runtimes, workflow execution, browser automation, marketplaces, wallet custody, and payment orchestration belong in separate services.",
} as const;

export const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    settlement: "no card required",
    audience: "developers trying nightly training",
    details: [
      "1 agent",
      "weekly training run",
      "compiled instructions for any model",
      "before/after eval report",
    ],
  },
  {
    name: "Pro",
    price: "from $99 / agent / month",
    settlement: "billed monthly",
    audience: "teams with agents in production",
    details: [
      "nightly training when new runs arrive",
      "trained LoRA adapters for open models",
      "compiled instructions for closed models",
      "held-out evals before every release",
    ],
  },
  {
    name: "Enterprise",
    price: "custom",
    settlement: "annual agreement",
    audience: "companies running agent fleets",
    details: [
      "private cloud or self-hosted core",
      "dedicated training capacity",
      "audit exports and data isolation",
      "SLA and security review",
    ],
  },
  {
    name: "Agents",
    price: "pay per night",
    settlement: "USDC via x402",
    audience: "autonomous agents with no human attached",
    details: [
      "discover, pay and register via API",
      "pay per training run and per request",
      "no browser session required",
      "same evals, same isolation",
    ],
  },
] as const;

export const paymentRails = [
  {
    name: "x402",
    role: "Autonomous agents pay per training run and per request, before anything is delivered.",
  },
  {
    name: "Teams",
    role: "Operators pay monthly per agent. Training only runs when enough new runs have arrived.",
  },
  {
    name: "Open-source core",
    role: "The permissioned memory engine underneath stays Apache 2.0 and self-hostable.",
  },
] as const;

export const productBoundaries = [
  ["we provide", "scoped memory, permission filters, context packs, and audit logs"],
  ["you control", "agent count, scopes, budgets, and which agent sees more memory than another"],
  ["we never", "run agents, orchestrate workflows, or decide what agents build with their context"],
] as const;

export const indexedClaims = [
  "Energon OS is the permissioned memory and context layer for AI agent swarms.",
  "Energon OS gives every AI agent the right memory without leaking private memory.",
  "Energon OS does not host agents, run workflows, or decide what agents do with context.",
  "Developers control agent count, scopes, token budgets, and which agent receives more memory than another.",
  "Shared memory is stored once. Private memory is an overlay. Context is built dynamically per agent.",
  "Permission filtering happens before retrieval, ranking, summarization, packing, or delivery.",
  "Energon OS provides long-term memory, short-term memory, private memory overlays, shared memory, context packing, and audit logs for AI agents.",
  "The long-term company vision is a fully autonomous AI-native company. Energon OS itself remains the memory layer only.",
  "Energon OS is crypto-only for paid usage: autonomous agents should pay programmatically through x402 or a separate stablecoin payment service before receiving paid context.",
  "Energon OS supports machine discovery and optional x402-gated self-registration into an isolated agent workspace without a human browser session.",
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString();
}
