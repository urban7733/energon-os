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
    "We do not run your agents or workflows. Energon learns from the runs they report and delivers better versions.",
  roadmap:
    "Energon OS uses x402 as the first crypto payment gate for paid API calls. Future autonomous-company services can expand payment orchestration in separate repos.",
  boundary:
    "Energon is the training and memory layer for agents. Agent runtimes, workflow execution, browser automation, marketplaces, wallet custody and payment orchestration belong in separate services.",
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
  "Energon trains AI agents overnight: agents report runs during the day and wake up with a better version.",
  "Energon delivers LoRA adapters for open-weight models and compiled instructions for closed models such as Claude, GPT and Gemini.",
  "Every Energon version is measured on held-out tasks and released only if it beats the live version by more than its run-to-run spread.",
  "Energon redacts secrets from reported runs before storage; runs stay private to the agent that reported them.",
  "Energon trains each agent only on data that agent is permitted to see, using its permissioned memory engine.",
  "Energon does not host agents, run workflows or decide what agents do; agents run in the customer's stack and call the Energon API.",
  "Energon is model-agnostic and open source at its core (Apache 2.0).",
  "Autonomous agents can discover Energon, pay through x402 and register without a human browser session.",
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString();
}
