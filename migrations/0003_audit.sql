CREATE TABLE IF NOT EXISTS context_requests (
    request_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    token_budget INTEGER NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    denied_memory_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS context_request_items (
    request_id TEXT NOT NULL REFERENCES context_requests(request_id) ON DELETE CASCADE,
    memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (request_id, memory_id)
);

CREATE INDEX IF NOT EXISTS context_requests_agent_created_idx
    ON context_requests(agent_id, created_at DESC);

