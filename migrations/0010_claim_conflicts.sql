-- Structured claims are separate from free-form memory. An agent can supply
-- evidence and confidence, but authority is derived from this operator-owned
-- role policy table on the server.
CREATE TABLE IF NOT EXISTS swarm_role_policies (
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    role_id TEXT NOT NULL,
    authority_bps INTEGER NOT NULL CHECK (authority_bps BETWEEN 0 AND 10000),
    can_resolve_conflicts BOOLEAN NOT NULL DEFAULT false,
    policy_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, role_id)
);

CREATE TABLE IF NOT EXISTS memory_claims (
    claim_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    subject TEXT NOT NULL CHECK (btrim(subject) <> ''),
    predicate TEXT NOT NULL CHECK (btrim(predicate) <> ''),
    value JSONB NOT NULL,
    confidence_bps INTEGER NOT NULL CHECK (confidence_bps BETWEEN 0 AND 10000),
    authority_bps INTEGER NOT NULL CHECK (authority_bps BETWEEN 0 AND 10000),
    score BIGINT NOT NULL CHECK (score >= 0),
    asserted_by_agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    evidence_memory_ids TEXT[] NOT NULL DEFAULT '{}',
    state TEXT NOT NULL CHECK (state IN ('accepted', 'contested', 'superseded', 'rejected')),
    conflict_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS memory_claims_lookup_idx
    ON memory_claims (org_id, subject, predicate, created_at DESC);

CREATE TABLE IF NOT EXISTS claim_evidence (
    claim_id TEXT NOT NULL REFERENCES memory_claims(claim_id) ON DELETE CASCADE,
    memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE RESTRICT,
    PRIMARY KEY (claim_id, memory_id)
);

CREATE INDEX IF NOT EXISTS claim_evidence_memory_idx
    ON claim_evidence (memory_id);

CREATE TABLE IF NOT EXISTS claim_conflicts (
    conflict_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    incumbent_claim_id TEXT NOT NULL REFERENCES memory_claims(claim_id) ON DELETE CASCADE,
    challenger_claim_id TEXT NOT NULL UNIQUE REFERENCES memory_claims(claim_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('contested', 'resolved')),
    resolved_claim_id TEXT REFERENCES memory_claims(claim_id) ON DELETE SET NULL,
    resolution_reason TEXT,
    resolved_by_user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS claim_conflicts_org_status_idx
    ON claim_conflicts (org_id, status, created_at DESC);

-- A per-swarm immutable decision ledger. The application computes event hashes
-- from canonical JSON after taking a transaction-scoped advisory lock per org.
CREATE TABLE IF NOT EXISTS audit_chain_events (
    sequence BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    previous_hash TEXT,
    event_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_chain_events_org_sequence_idx
    ON audit_chain_events (org_id, sequence DESC);
