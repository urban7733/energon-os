-- Deliberately separate from memories/chunks: dreams never enter factual retrieval.
CREATE TABLE IF NOT EXISTS agent_dreams (
    dream_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    owner_agent_id TEXT,
    scope TEXT NOT NULL CHECK (scope IN ('agent_private', 'open', 'org', 'project', 'role')),
    project_id TEXT,
    role_id TEXT,
    created_at_unix_ms BIGINT NOT NULL,
    document JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_dreams_access ON agent_dreams (org_id, scope, owner_agent_id, created_at_unix_ms DESC);
