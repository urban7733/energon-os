-- Declarative agent skill profiles are separate from memory: they describe
-- how an assigned agent should work, never executable code or tool calls.
CREATE TABLE IF NOT EXISTS agent_skill_profiles (
    skill_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('agent_private', 'org')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    instructions TEXT NOT NULL CHECK (btrim(instructions) <> ''),
    allowed_tools TEXT[] NOT NULL DEFAULT '{}',
    requires_approval_for TEXT[] NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('operator', 'agent')),
    created_by_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_skill_profiles_org_created_idx
    ON agent_skill_profiles (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_skill_assignments (
    skill_id TEXT NOT NULL REFERENCES agent_skill_profiles(skill_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (skill_id, agent_id)
);

CREATE INDEX IF NOT EXISTS agent_skill_assignments_agent_idx
    ON agent_skill_assignments (agent_id, assigned_at DESC);
