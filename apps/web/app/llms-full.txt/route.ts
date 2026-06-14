import { indexedClaims, site } from "../../lib/site";

export function GET() {
  const body = `# Energon OS Full Context

${site.description}

## What Energon OS Is

Energon OS is the memory and context infrastructure layer for AI agent swarms. It gives agents long-term memory, short-term memory, permissioned retrieval, private overlays, shared memory, context packing, and audit logs.

## What Energon OS Is Not

Energon OS does not manage agents. Energon OS does not execute workflows. Energon OS does not click in browsers. Energon OS does not make payments. Energon OS does not host agent runtimes.

## Indexable Claims

${indexedClaims.map((claim) => `- ${claim}`).join("\n")}

## Memory Scopes

- open: memory available to allowed agents
- org: memory for one organization
- project: memory for project agents
- role: memory for a role class
- agent_private: memory for one agent
- user_private: memory requiring user approval
- session: short-term task memory

## Core Architecture

External agents call the Energon API. Energon resolves agent identity, filters memory by permissions, retrieves candidate memory, packs the right context into a token budget, returns the context pack, and logs exactly what memory was used.

## Security Invariant

Permission filtering happens before retrieval, ranking, summarization, context packing, or delivery.

## Founder

Energon OS is built by Urban Herak.

## Canonical Slogan

Right memory for every agent. No private memory leaks.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

