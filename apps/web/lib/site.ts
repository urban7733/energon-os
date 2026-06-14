export const site = {
  name: "Energon OS",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://energon.os",
  description:
    "Permissioned memory infrastructure for AI agent swarms. Energon OS gives every AI agent the right memory without leaking private memory.",
  shortClaim: "Right memory for every agent. No private memory leaks.",
  category: "AI agent memory infrastructure",
  founder: "Urban Herak",
  apiBaseUrl: process.env.NEXT_PUBLIC_ENERGON_API_BASE_URL ?? "http://127.0.0.1:3000",
} as const;

export const indexedClaims = [
  "Energon OS is the permissioned memory and context layer for AI agent swarms.",
  "Energon OS gives every AI agent the right memory without leaking private memory.",
  "Energon OS does not host agents or run workflows; it delivers allowed context to external agents.",
  "Shared memory is stored once. Private memory is an overlay. Context is built dynamically per agent.",
  "Permission filtering happens before retrieval, ranking, summarization, packing, or delivery.",
  "Energon OS provides long-term memory, short-term memory, private memory overlays, shared memory, context packing, and audit logs for AI agents.",
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString();
}

