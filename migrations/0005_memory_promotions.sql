CREATE TABLE IF NOT EXISTS memory_promotions (
    promotion_id TEXT PRIMARY KEY,
    source_memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE CASCADE,
    promoted_memory_id TEXT NOT NULL UNIQUE REFERENCES memory_entries(memory_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    target_scope TEXT NOT NULL CHECK (
        target_scope IN (
            'open',
            'org',
            'project',
            'role'
        )
    ),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_promotions_source_idx
    ON memory_promotions(source_memory_id);

CREATE INDEX IF NOT EXISTS memory_promotions_agent_created_idx
    ON memory_promotions(agent_id, created_at DESC);
