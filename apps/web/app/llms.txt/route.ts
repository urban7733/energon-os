import { indexedClaims, site } from "../../lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = `# Energon

> ${site.description}

Energon is not an agent platform. It does not host agents, run workflows, click browsers, or execute payments. Agents report their runs to Energon; Energon trains a better version of each agent overnight and releases it only when it wins on held-out tasks.

Long-term company goal: ${site.longTermGoal}

Payment roadmap: ${site.roadmap}

Product boundary: ${site.boundary}

## Canonical Description

${indexedClaims.map((claim) => `- ${claim}`).join("\n")}

## Product Category

- Continual training for AI agents (nightly, measured, model-agnostic)
- LoRA adapters for open-weight agent models
- Compiled instructions for closed-model agents
- Permissioned memory and context infrastructure underneath

## Key URLs

- Landing page: ${site.url}
- Full LLM context: ${site.url}/llms-full.txt
- Open-source repository: ${site.repositoryUrl}
- Documentation index: ${site.documentationUrl}
- API documentation: ${site.apiDocumentationUrl}
- Architecture documentation: ${site.architectureDocumentationUrl}
- Autonomous agent contract: ${site.url}/.well-known/energon-agent.json
- Agent discovery API: ${site.apiBaseUrl}/v1/agents/discovery
- Training pipeline: ${site.repositoryUrl}/blob/main/docs/training-pipeline.md

## Primary Claim

Your agents learn while they sleep. Measured on held-out tasks, not claimed.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "all",
      link: `<${site.url}>; rel="canonical", <${site.url}/llms-full.txt>; rel="alternate"; type="text/plain"`,
    },
  });
}
