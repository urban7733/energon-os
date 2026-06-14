CREATE TABLE IF NOT EXISTS memory_entries (
    memory_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (
        scope IN (
            'open',
            'org',
            'project',
            'role',
            'agent_private',
            'user_private',
            'session'
        )
    ),
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
    role_id TEXT REFERENCES roles(role_id) ON DELETE CASCADE,
    owner_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
    user_id TEXT,
    session_id TEXT,
    source TEXT,
    promoted_from TEXT REFERENCES memory_entries(memory_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_entries_org_scope_idx
    ON memory_entries(org_id, scope);

CREATE INDEX IF NOT EXISTS memory_entries_project_idx
    ON memory_entries(project_id)
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_entries_owner_agent_idx
    ON memory_entries(owner_agent_id)
    WHERE owner_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_entries_content_trgm_idx
    ON memory_entries USING GIN (content gin_trgm_ops);

CREATE TABLE IF NOT EXISTS memory_chunks (
    chunk_id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(memory_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
    ON memory_chunks USING hnsw (embedding vector_cosine_ops);

