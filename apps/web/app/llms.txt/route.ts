import { indexedClaims, site } from "../../lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = `# Energon OS

> ${site.description}

Energon OS is not an agent platform. It does not host agents, run workflows, click browsers, or execute payments. It is the memory and context layer for external AI agents.

Long-term company goal: ${site.longTermGoal}

Payment roadmap: ${site.roadmap}

Product boundary: ${site.boundary}

## Canonical Description

${indexedClaims.map((claim) => `- ${claim}`).join("\n")}

## Product Category

- Permissioned memory infrastructure for AI agent swarms
- Context broker for external AI agents
- Private and shared memory layer for AI-native companies
- Memory infrastructure for autonomous-company systems with separate crypto payment services

## Key URLs

- Landing page: ${site.url}
- Full LLM context: ${site.url}/llms-full.txt
- API documentation: ${site.url}/docs/api
- Architecture documentation: ${site.url}/docs/architecture

## Primary Claim

Energon OS gives every AI agent the right memory, without leaking private memory.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
