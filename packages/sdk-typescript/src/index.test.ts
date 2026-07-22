import { expect, test } from "bun:test";

import { Energon } from "./index.js";

test("memory.remember writes private memory through the control plane", async () => {
  let capturedRequest: Request | undefined;
  const client = new Energon({
    baseUrl: "https://api.energon.test/",
    apiKey: "eos_live_test",
    paymentSignature: () => "payment-token",
    fetch: async (input, init) => {
      capturedRequest = new Request(input, init);
      return Response.json({
        memory_id: "mem_1",
        org_id: "org_1",
        scope: "agent_private",
        content: "Private note",
        tags: ["priority"],
        project_id: null,
        role_id: null,
        owner_agent_id: "agent_1",
        user_id: null,
        session_id: null,
        source: null,
        promoted_from: null,
        created_at_unix_ms: 1,
      });
    },
  });

  const memory = await client.memory.remember({ content: " Private note ", tags: [" priority ", ""] });

  expect(memory.scope).toBe("agent_private");
  expect(capturedRequest?.url).toBe("https://api.energon.test/v1/memory/write");
  expect(capturedRequest?.method).toBe("POST");
  expect(capturedRequest?.headers.get("authorization")).toBe("Bearer eos_live_test");
  expect(capturedRequest?.headers.get("payment-signature")).toBe("payment-token");
  expect(await capturedRequest?.json()).toEqual({
    scope: "agent_private",
    content: "Private note",
    tags: ["priority"],
  });
});

test("write failures are surfaced without unsafe automatic retries", async () => {
  let calls = 0;
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async () => {
      calls += 1;
      return Response.json({ error: "rate limited" }, { status: 429 });
    },
  });

  await expect(client.memory.remember({ content: "note" })).rejects.toMatchObject({
    name: "EnergonError",
    status: 429,
    message: "rate limited",
  });
  expect(calls).toBe(1);
});

test("claims.assert sends structured evidence without client-supplied authority", async () => {
  let capturedRequest: Request | undefined;
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async (input, init) => {
      capturedRequest = new Request(input, init);
      return Response.json({
        claim: {
          claim_id: "claim_1",
          subject: "vendor:acme",
          predicate: "security_status",
          value: { status: "review_required" },
          confidence_bps: 8700,
          authority_bps: 5000,
          score: 43500000,
          state: "accepted",
          conflict_id: null,
          created_at_unix_ms: 1,
        },
        resolution: "accepted",
        conflict_id: null,
      });
    },
  });

  const result = await client.claims.assert({
    subject: " vendor:acme ",
    predicate: "security_status",
    value: { status: "review_required" },
    confidenceBps: 8700,
    evidenceMemoryIds: [" mem_1 ", "mem_1"],
  });

  expect(result.claim.claim_id).toBe("claim_1");
  expect(capturedRequest?.url).toBe("https://api.energon.test/v1/claims/assert");
  expect(await capturedRequest?.json()).toEqual({
    subject: "vendor:acme",
    predicate: "security_status",
    value: { status: "review_required" },
    confidence_bps: 8700,
    evidence_memory_ids: ["mem_1"],
  });
});

test("swarm.runtime returns the authenticated agent contract", async () => {
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async () => Response.json({
      contract_version: "v1",
      swarm_id: "org_1",
      agent: { agent_id: "agent_1", role_id: "research", project_id: "project_1" },
      guarantees: {
        permission_filter_before_retrieval: true,
        private_memory_by_default: true,
        explicit_shared_promotion: true,
        context_audit: true,
      },
      capabilities: ["memory.private.write"],
    }),
  });

  const runtime = await client.swarm.runtime();
  expect(runtime.swarm_id).toBe("org_1");
  expect(runtime.guarantees.private_memory_by_default).toBe(true);
});

test("safe runtime reads retry temporary availability failures", async () => {
  let calls = 0;
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ error: "temporarily unavailable" }, { status: 503 });
      }
      return Response.json({
        contract_version: "v1",
        swarm_id: "org_1",
        agent: { agent_id: "agent_1", role_id: null, project_id: null },
        guarantees: {
          permission_filter_before_retrieval: true,
          private_memory_by_default: true,
          explicit_shared_promotion: true,
          context_audit: true,
        },
        capabilities: [],
      });
    },
  });

  await expect(client.swarm.runtime()).resolves.toMatchObject({ swarm_id: "org_1" });
  expect(calls).toBe(2);
});
