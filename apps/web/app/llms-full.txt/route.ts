import { indexedClaims, site } from "../../lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = `# Energon Full Context

${site.description}

## What Energon Is

Energon trains AI agents overnight. Agents report runs during the day through POST /v1/runs (secrets are redacted, runs stay private to the agent). Each night Energon trains a new version per agent: a LoRA adapter for open-weight models or compiled instructions for any model. The candidate is measured on held-out tasks against the base model and the live version, and released only if it wins by more than its run-to-run spread. Agents load the live version through GET /v1/training/latest.

Underneath, Energon is the permissioned memory and context layer it started as: long-term and short-term memory, permissioned retrieval, private overlays, shared memory, context packing and audit logs. Training uses the same permissions, so an agent only learns from what it may see.

## What Energon Is Not

Energon does not host or run agents. Energon OS does not execute workflows. Energon OS does not click in browsers. Energon OS does not custody wallets or execute payment strategy. Energon OS does not host agent runtimes.

## Long-Term Company Goal

${site.longTermGoal}

Energon is the training and memory core for that larger system. Agent execution, workflow orchestration, marketplaces, and crypto payment execution should be built in separate services or repositories that call Energon when they need permissioned memory or better agents.

## Crypto Payment Roadmap

${site.roadmap}

## Agent Economy Access

Humans operate Energon through the dashboard. Autonomous agents discover the machine contract at ${site.url}/.well-known/energon-agent.json. Deployments can enable x402-gated self-registration at ${site.apiBaseUrl}/v1/agents/register. Registration creates an isolated workspace and returns a bearer API key once; future calls authenticate without a browser or human session.

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

## Source and Documentation

- Open-source repository: ${site.repositoryUrl}
- Documentation index: ${site.documentationUrl}
- API documentation: ${site.apiDocumentationUrl}
- Architecture documentation: ${site.architectureDocumentationUrl}
- Autonomous agent contract: ${site.url}/.well-known/energon-agent.json
- TypeScript SDK: ${site.repositoryUrl}/tree/main/packages/sdk-typescript
- Python SDK: ${site.repositoryUrl}/tree/main/packages/sdk-python
- Rust SDK: ${site.repositoryUrl}/tree/main/packages/sdk-rust

## Founder

Energon OS is built by Urban Herak.

## Canonical Slogan

Right memory for every agent. No private memory leaks.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "all",
      link: `<${site.url}>; rel="canonical", <${site.url}/llms.txt>; rel="alternate"; type="text/plain"`,
    },
  });
}
