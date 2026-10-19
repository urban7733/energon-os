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

test("skills create private profiles and list only the active agent profiles", async () => {
  const requests: Request[] = [];
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === "GET") {
        return Response.json({ org_id: "org_1", skills: [] });
      }
      return Response.json({
        skill_id: "skill_1",
        scope: "agent_private",
        name: "Concise writer",
        instructions: "Use concise language.",
        allowed_tools: ["write"],
        requires_approval_for: ["send"],
        version: 1,
        created_by_kind: "agent",
        created_by_id: "agent_1",
        created_at_unix_ms: 1,
        assigned_agent_ids: ["agent_1"],
        executable: false,
      });
    },
  });

  const skill = await client.skills.create({
    name: " Concise writer ",
    instructions: " Use concise language. ",
    allowedTools: [" write ", ""],
    requiresApprovalFor: [" send "],
  });
  await client.skills.list();

  expect(skill.scope).toBe("agent_private");
  expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
    "POST /v1/skills",
    "GET /v1/skills",
  ]);
  expect(await requests[0]?.json()).toEqual({
    name: "Concise writer",
    instructions: "Use concise language.",
    allowed_tools: ["write"],
    requires_approval_for: ["send"],
  });
});

test("operations.overview exposes agent-safe dashboard telemetry", async () => {
  let capturedRequest: Request | undefined;
  const client = new Energon({
    baseUrl: "https://api.energon.test",
    apiKey: "eos_live_test",
    fetch: async (input, init) => {
      capturedRequest = new Request(input, init);
      return Response.json({
        contract_version: "v1",
        generated_at_unix_ms: 1,
        org_id: "org_1",
        agent: { agent_id: "agent_1", role_id: null, project_id: null },
        system: { health: { status: "ok", storage: "postgres", database: "connected" }, x402: {} },
        directory: [],
        stats: {
          memory: { total_memories: 4, scopes: [] },
          usage: { storage: "postgres", totals: [] },
          event_delivery: { storage: "postgres", pending: 0, leased: 0, published: 2, retrying: 0 },
          conflict_summary: { contested: 0, resolved: 0 },
        },
        role_policies: [],
        conflicts: [],
        assigned_skills: [],
        billing: { configured: false, entitlement: null },
        redactions: ["agent API keys and their hashes"],
      });
    },
  });

  const overview = await client.operations.overview();

  expect(overview.stats.memory.total_memories).toBe(4);
  expect(capturedRequest?.url).toBe("https://api.energon.test/v1/agent/overview");
  expect(capturedRequest?.method).toBe("GET");
});

test("dream reflection may decline storage and never shares automatically", async () => {
  const paths: string[] = [];
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "test", fetch: async (url) => {
    paths.push(String(url));
    return Response.json({ context_pack: ["allowed knowledge"], items: [] });
  }});
  const result = await client.dreams.reflect({ task: "Reflect", generate: async (context) => {
    expect(context.context_pack).toEqual(["allowed knowledge"]);
    return null;
  }});
  expect(result).toBeNull();
  expect(paths).toEqual(["https://api.energon.test/v1/context/build"]);
});

test("dream sharing sends only the selected excerpt and an explicit reason", async () => {
  let body: unknown;
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "test", fetch: async (url, init) => {
    expect(String(url)).toEndWith("/v1/dreams/share");
    body = JSON.parse(String(init?.body));
    return Response.json({ speculative: true, content: "Selected idea" });
  }});
  await client.dreams.share({ dreamId: "dream_1", content: "Selected idea", target: "project", reason: "Brainstorm" });
  expect(body).toEqual({ dream_id: "dream_1", content: "Selected idea", target_scope: "project", reason: "Brainstorm" });
});

test("failed external dream generation never writes a dream", async () => {
  const paths: string[] = [];
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "test", fetch: async (url) => {
    paths.push(String(url));
    return Response.json({ context_pack: [] });
  }});
  await expect(client.dreams.reflect({ task: "Reflect", generate: async () => { throw new Error("runtime failed"); } })).rejects.toThrow("runtime failed");
  expect(paths).toEqual(["https://api.energon.test/v1/context/build"]);
});

test("plain http is refused for remote hosts unless explicitly allowed", () => {
  const fetch = async () => Response.json({});
  expect(() => new Energon({ baseUrl: "http://api.energon.test", apiKey: "k", fetch })).toThrow("https");
  expect(() => new Energon({ baseUrl: "http://127.0.0.1:3001", apiKey: "k", fetch })).not.toThrow();
  expect(() => new Energon({ baseUrl: "http://localhost:3001", apiKey: "k", fetch })).not.toThrow();
  expect(() => new Energon({ baseUrl: "http://[::1]:3001", apiKey: "k", fetch })).not.toThrow();
  expect(() => new Energon({ baseUrl: "http://energon-api:3000", apiKey: "k", fetch, allowInsecureHttp: true })).not.toThrow();
});

test("requests never follow redirects with the bearer key", async () => {
  let init: RequestInit | undefined;
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "k", fetch: async (_url, requestInit) => {
    init = requestInit;
    return Response.json({ skills: [] });
  }});
  await client.skills.list();
  expect(init?.redirect).toBe("error");
});

test("dream journal pages with filters, follows cursors, and forgets", async () => {
  const urls: string[] = [];
  const methods: string[] = [];
  const pages = [
    { dreams: [{ memory_id: "dream_2" }], next_cursor: "5:dream_2" },
    { dreams: [{ memory_id: "dream_1" }], next_cursor: null },
    { dream_id: "dream_2", forgotten: true },
  ];
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "k", fetch: async (url, init) => {
    urls.push(String(url));
    methods.push(init?.method ?? "GET");
    return Response.json(pages.shift());
  }});
  const ids: string[] = [];
  for await (const dream of client.dreams.iterate({ view: "private", tag: "growth", limit: 1 })) {
    ids.push(dream.memory_id);
  }
  await client.dreams.forget("dream_2");
  expect(ids).toEqual(["dream_2", "dream_1"]);
  expect(urls[0]).toBe("https://api.energon.test/v1/dreams?limit=1&view=private&tag=growth");
  expect(urls[1]).toContain("cursor=5%3Adream_2");
  expect(urls[2]).toBe("https://api.energon.test/v1/dreams/dream_2");
  expect(methods[2]).toBe("DELETE");
  await expect(client.dreams.page({ limit: 0 })).rejects.toThrow("limit");
});

test("reflection cites the context it dreamed on and keeps chosen tags", async () => {
  let recorded: unknown;
  const client = new Energon({ baseUrl: "https://api.energon.test", apiKey: "k", fetch: async (url, init) => {
    if (String(url).endsWith("/v1/context/build")) {
      return Response.json({ context_pack: ["fact"], items: [{ memory_id: "mem_7" }] });
    }
    recorded = JSON.parse(String(init?.body));
    return Response.json({ memory_id: "dream_9", speculative: true });
  }});
  await client.dreams.reflect({ task: "Reflect", tags: ["night"], generate: async () => ({ content: "A hypothesis", inspiredBy: ["dream_1"] }) });
  expect(recorded).toEqual({ content: "A hypothesis", tags: ["night"], inspired_by: ["dream_1", "mem_7"] });
});
