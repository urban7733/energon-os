/**
 * The official TypeScript client for the Energon OS swarm control plane.
 *
 * Keep this package server-side. Agent API keys are credentials and must not
 * be shipped to a browser bundle.
 */

export const SDK_VERSION = "0.1.0";

export type MemoryScope = "open" | "org" | "project" | "role" | "agent_private" | "user_private" | "session";
export type SharedMemoryScope = Extract<MemoryScope, "open" | "org" | "project" | "role">;

export interface AgentMemory {
  memory_id: string;
  org_id: string;
  scope: MemoryScope;
  content: string;
  tags: string[];
  project_id: string | null;
  role_id: string | null;
  owner_agent_id: string | null;
  user_id: string | null;
  session_id: string | null;
  source: string | null;
  promoted_from: string | null;
  created_at_unix_ms: number;
}

export interface ContextItem {
  memory_id: string;
  scope: MemoryScope;
  content: string;
  estimated_tokens: number;
  reason: string;
}

export interface ContextPack {
  request_id: string;
  agent_id: string;
  task: string;
  token_budget: number;
  estimated_tokens: number;
  context_pack: string[];
  items: ContextItem[];
}

export interface ContextAudit {
  request_id: string;
  agent_id: string;
  org_id: string;
  task: string;
  allowed_memory_ids: string[];
  denied_memory_count: number;
  token_budget: number;
  estimated_tokens: number;
  created_at_unix_ms: number;
}

export interface PromotionAudit {
  promotion_id: string;
  source_memory_id: string;
  promoted_memory_id: string;
  agent_id: string;
  org_id: string;
  target_scope: SharedMemoryScope;
  reason: string;
  created_at_unix_ms: number;
}

export interface SwarmRuntime {
  contract_version: "v1";
  swarm_id: string;
  agent: {
    agent_id: string;
    role_id: string | null;
    project_id: string | null;
  };
  guarantees: {
    permission_filter_before_retrieval: true;
    private_memory_by_default: true;
    explicit_shared_promotion: true;
    context_audit: true;
  };
  capabilities: string[];
}

export interface RememberInput {
  content: string;
  tags?: string[];
  source?: string;
}

export interface ShareMemoryInput {
  memoryId: string;
  target: SharedMemoryScope;
  reason: string;
}

export interface BuildContextInput {
  task: string;
  /** Uses the authenticated agent's project when omitted. */
  projectId?: string;
  tokenBudget?: number;
}

export interface PaymentSignatureProvider {
  (): string | undefined | Promise<string | undefined>;
}

export interface EnergonClientOptions {
  /** Control-plane origin, for example https://api.example.com. */
  baseUrl: string;
  /** Agent-specific `eos_live_...` credential. Never expose it in a browser. */
  apiKey: string;
  /** Supplies an x402 payment payload immediately before an agent request. */
  paymentSignature?: PaymentSignatureProvider;
  /** Defaults to 15 seconds. Set to 0 to disable the SDK timeout. */
  timeoutMs?: number;
  /** Injected for tests or runtimes that provide a custom Fetch implementation. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface EnergonErrorDetails {
  status: number;
  message: string;
  requestId?: string;
  paymentRequired?: unknown;
}

export class EnergonError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly paymentRequired?: unknown;

  constructor(details: EnergonErrorDetails) {
    super(details.message);
    this.name = "EnergonError";
    this.status = details.status;
    this.requestId = details.requestId;
    this.paymentRequired = details.paymentRequired;
  }
}

export class EnergonNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EnergonNetworkError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRYABLE_GET_STATUS = new Set([429, 502, 503, 504]);
const MAX_GET_ATTEMPTS = 3;

type RequestMethod = "GET" | "POST";

interface RequestInitOptions {
  method: RequestMethod;
  body?: unknown;
  options?: RequestOptions;
}

/**
 * A server-side client for one authenticated agent in one swarm. Agent identity
 * is always derived by the control plane from the API key, never from SDK input.
 */
export class Energon {
  readonly memory: {
    remember: (input: RememberInput, options?: RequestOptions) => Promise<AgentMemory>;
    share: (input: ShareMemoryInput, options?: RequestOptions) => Promise<AgentMemory>;
  };

  readonly context: {
    build: (input: BuildContextInput, options?: RequestOptions) => Promise<ContextPack>;
  };

  readonly audit: {
    context: (requestId: string, options?: RequestOptions) => Promise<ContextAudit>;
    promotion: (memoryId: string, options?: RequestOptions) => Promise<PromotionAudit>;
  };

  readonly swarm: {
    runtime: (options?: RequestOptions) => Promise<SwarmRuntime>;
  };

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly paymentSignature?: PaymentSignatureProvider;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: EnergonClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = requiredText(options.apiKey, "apiKey");
    this.paymentSignature = options.paymentSignature;
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.fetchFn = options.fetch ?? globalThis.fetch;

    if (typeof this.fetchFn !== "function") {
      throw new TypeError("A Fetch implementation is required to use @energon/sdk.");
    }

    this.memory = {
      remember: (input, requestOptions) => this.remember(input, requestOptions),
      share: (input, requestOptions) => this.share(input, requestOptions),
    };
    this.context = {
      build: (input, requestOptions) => this.buildContext(input, requestOptions),
    };
    this.audit = {
      context: (requestId, requestOptions) => this.request(`/v1/audit/context/${requiredPathSegment(requestId, "requestId")}`, {
        method: "GET",
        options: requestOptions,
      }),
      promotion: (memoryId, requestOptions) => this.request(`/v1/audit/promotion/${requiredPathSegment(memoryId, "memoryId")}`, {
        method: "GET",
        options: requestOptions,
      }),
    };
    this.swarm = {
      runtime: (requestOptions) => this.request("/v1/swarm/runtime", {
        method: "GET",
        options: requestOptions,
      }),
    };
  }

  private async remember(input: RememberInput, options?: RequestOptions): Promise<AgentMemory> {
    return this.request("/v1/memory/write", {
      method: "POST",
      body: {
        scope: "agent_private",
        content: requiredText(input.content, "content"),
        tags: normalizeTags(input.tags),
        source: optionalText(input.source),
      },
      options,
    });
  }

  private async share(input: ShareMemoryInput, options?: RequestOptions): Promise<AgentMemory> {
    if (!isSharedScope(input.target)) {
      throw new TypeError("target must be open, org, project, or role.");
    }

    return this.request("/v1/memory/promote", {
      method: "POST",
      body: {
        memory_id: requiredText(input.memoryId, "memoryId"),
        target_scope: input.target,
        reason: requiredText(input.reason, "reason"),
      },
      options,
    });
  }

  private async buildContext(input: BuildContextInput, options?: RequestOptions): Promise<ContextPack> {
    const tokenBudget = input.tokenBudget;
    if (tokenBudget !== undefined && (!Number.isInteger(tokenBudget) || tokenBudget <= 0)) {
      throw new TypeError("tokenBudget must be a positive integer when provided.");
    }

    return this.request("/v1/context/build", {
      method: "POST",
      body: {
        task: requiredText(input.task, "task"),
        project_id: optionalText(input.projectId),
        token_budget: tokenBudget,
      },
      options,
    });
  }

  private async request<ResponseBody>(path: string, request: RequestInitOptions): Promise<ResponseBody> {
    const attempts = request.method === "GET" ? MAX_GET_ATTEMPTS : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(path, request);
        if (response.ok) {
          return await parseJson<ResponseBody>(response);
        }

        const error = await responseToError(response);
        if (attempt < attempts && RETRYABLE_GET_STATUS.has(error.status)) {
          await delay(retryDelayMs(response, attempt), request.options?.signal);
          continue;
        }

        throw error;
      } catch (error) {
        if (error instanceof EnergonError || isAbortError(error)) {
          throw error;
        }

        lastError = error;
        if (attempt < attempts && request.method === "GET") {
          await delay(backoffMs(attempt), request.options?.signal);
          continue;
        }
      }
    }

    throw new EnergonNetworkError("Unable to reach the Energon control plane.", lastError);
  }

  private async fetchWithTimeout(path: string, request: RequestInitOptions): Promise<Response> {
    const controller = new AbortController();
    const timer = this.timeoutMs > 0
      ? setTimeout(() => controller.abort(new DOMException("The Energon request timed out.", "TimeoutError")), this.timeoutMs)
      : undefined;
    const signal = combineSignals(request.options?.signal, controller.signal);
    const headers = new Headers({
      authorization: `Bearer ${this.apiKey}`,
      "x-energon-sdk": `typescript/${SDK_VERSION}`,
    });

    if (request.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const paymentSignature = await this.paymentSignature?.();
    if (paymentSignature?.trim()) {
      headers.set("payment-signature", paymentSignature.trim());
    }

    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const raw = requiredText(value, "baseUrl");
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("baseUrl must use http or https.");
  }
  return url.toString().replace(/\/$/, "");
}

function normalizeTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new TypeError("timeoutMs must be a non-negative finite number.");
  }
  return timeout;
}

function requiredText(value: string, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new TypeError(`${name} cannot be empty.`);
  }
  return normalized;
}

function requiredPathSegment(value: string, name: string): string {
  return encodeURIComponent(requiredText(value, name));
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

function isSharedScope(scope: string): scope is SharedMemoryScope {
  return scope === "open" || scope === "org" || scope === "project" || scope === "role";
}

function backoffMs(attempt: number): number {
  return 150 * 2 ** (attempt - 1);
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number.parseFloat(retryAfter) : Number.NaN;
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
    ? retryAfterSeconds * 1_000
    : backoffMs(attempt);
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The request was aborted.", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("The request was aborted.", "AbortError"));
    }, { once: true });
  });
}

function combineSignals(external: AbortSignal | undefined, internal: AbortSignal): AbortSignal {
  if (!external) {
    return internal;
  }
  if (external.aborted) {
    return external;
  }
  return AbortSignal.any([external, internal]);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function parseJson<ResponseBody>(response: Response): Promise<ResponseBody> {
  try {
    return await response.json() as ResponseBody;
  } catch (error) {
    throw new EnergonNetworkError("Energon returned an invalid JSON response.", error);
  }
}

async function responseToError(response: Response): Promise<EnergonError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const paymentRequiredHeader = response.headers.get("payment-required");
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const message = isErrorBody(body) ? body.error : `Energon request failed with status ${response.status}.`;
  return new EnergonError({
    status: response.status,
    message,
    requestId,
    paymentRequired: parseJsonSafely(paymentRequiredHeader),
  });
}

function isErrorBody(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

function parseJsonSafely(value: string | null): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
