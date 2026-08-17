#!/usr/bin/env bun

const requiredEnvironment = [
  "ENERGON_API_URL",
  "ENERGON_AGENT_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ENERGON_AGENT_TASK",
  "ENERGON_AGENT_INPUT",
];

const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(`Missing required environment value(s): ${missing.join(", ")}`);
}

const apiBaseUrl = process.env.ENERGON_API_URL.trim().replace(/\/$/, "");
const agentApiKey = process.env.ENERGON_AGENT_API_KEY.trim();
const openAiApiKey = process.env.OPENAI_API_KEY.trim();
const model = process.env.OPENAI_MODEL.trim();
const task = process.env.ENERGON_AGENT_TASK.trim();
const input = process.env.ENERGON_AGENT_INPUT.trim();
const tags = splitTags(process.env.ENERGON_AGENT_TAGS ?? "");
const paymentSignature = process.env.ENERGON_PAYMENT_SIGNATURE?.trim();
const tokenBudget = optionalPositiveInteger(process.env.ENERGON_CONTEXT_TOKEN_BUDGET);

const memory = await createPrivateMemory(input, task);
const memoryRecord = await energonRequest("/v1/memory/write", {
  method: "POST",
  body: JSON.stringify({
    scope: "agent_private",
    content: memory,
    tags,
  }),
});

const contextPayload = { task };
if (tokenBudget !== undefined) contextPayload.token_budget = tokenBudget;

const context = await energonRequest("/v1/context/build", {
  method: "POST",
  body: JSON.stringify(contextPayload),
});
const audit = await energonRequest(`/v1/audit/context/${encodeURIComponent(context.request_id)}`);
const answer = await completeTask({ task, input, context });

console.log(
  JSON.stringify(
    {
      status: "completed",
      agent_id: context.agent_id,
      memory_id: memoryRecord.memory_id,
      context_request_id: context.request_id,
      context_items: Array.isArray(context.items) ? context.items.length : 0,
      audit: {
        allowed_memory_ids: audit.allowed_memory_ids,
        denied_memory_count: audit.denied_memory_count,
        estimated_tokens: audit.estimated_tokens,
        token_budget: audit.token_budget,
      },
      answer,
    },
    null,
    2,
  ),
);

async function createPrivateMemory(agentInput, agentTask) {
  const response = await openAiRequest({
    instructions:
      "You are an external AI agent connected to a permissioned memory service. " +
      "Turn the provided operational input into one concise, durable private memory that helps with the requested task. " +
      "Do not invent facts. Return only the memory content.",
    input: `Task:\n${agentTask}\n\nOperational input:\n${agentInput}`,
  });

  return requireOutputText(response, "private memory");
}

async function completeTask({ task: agentTask, input: agentInput, context: contextPack }) {
  const response = await openAiRequest({
    instructions:
      "You are an external AI agent. Complete the requested task using only the supplied operational input " +
      "and the permissioned memory context. Do not claim access to any other memory. State uncertainty when " +
      "the supplied material is insufficient.",
    input: JSON.stringify({
      task: agentTask,
      operational_input: agentInput,
      permissioned_memory: contextPack.context_pack,
    }),
  });

  return requireOutputText(response, "agent answer");
}

async function openAiRequest(body) {
  return requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({ model, ...body }),
  });
}

async function energonRequest(path, init = {}) {
  const headers = {
    "content-type": "application/json",
    Authorization: `Bearer ${agentApiKey}`,
    ...(init.headers ?? {}),
  };
  if (paymentSignature) headers["payment-signature"] = paymentSignature;

  return requestJson(`${apiBaseUrl}${path}`, { ...init, headers });
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  const body = raw ? parseJson(raw, url) : null;

  if (!response.ok) {
    const detail = typeof body === "object" && body !== null && "error" in body
      ? body.error
      : raw;
    throw new Error(`${init.method ?? "GET"} ${url} failed with ${response.status}: ${detail}`);
  }

  return body;
}

function parseJson(raw, url) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Expected JSON from ${url}`);
  }
}

function requireOutputText(response, label) {
  const text = extractOutputText(response).trim();
  if (!text) throw new Error(`OpenAI returned no ${label}.`);
  return text;
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  if (!Array.isArray(response?.output)) return "";

  return response.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function splitTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function optionalPositiveInteger(value) {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("ENERGON_CONTEXT_TOKEN_BUDGET must be a positive integer.");
  }
  return parsed;
}
