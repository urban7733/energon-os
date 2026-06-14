CREATE INDEX IF NOT EXISTS agent_api_keys_active_hash_idx
    ON agent_api_keys(key_hash)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS memory_entries_org_created_idx
    ON memory_entries(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_entries_role_idx
    ON memory_entries(role_id)
    WHERE role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_entries_user_idx
    ON memory_entries(user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_entries_session_idx
    ON memory_entries(session_id)
    WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS context_request_items_memory_idx
    ON context_request_items(memory_id);
