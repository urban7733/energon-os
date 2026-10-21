-- Nightly training: reported runs, per-agent configuration, jobs and versions.
-- Like agent_dreams, rows keep filter columns next to the full JSON document.

CREATE TABLE IF NOT EXISTS agent_runs (
    run_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'unknown')),
    created_at_unix_ms BIGINT NOT NULL,
    document JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_runs_agent_recent
    ON agent_runs (org_id, agent_id, created_at_unix_ms DESC);
CREATE INDEX IF NOT EXISTS agent_runs_agent_outcome
    ON agent_runs (org_id, agent_id, outcome, created_at_unix_ms DESC);

CREATE TABLE IF NOT EXISTS training_configs (
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    schedule_hour_utc SMALLINT NOT NULL CHECK (schedule_hour_utc BETWEEN 0 AND 23),
    updated_at_unix_ms BIGINT NOT NULL,
    document JSONB NOT NULL,
    PRIMARY KEY (org_id, agent_id)
);
CREATE INDEX IF NOT EXISTS training_configs_enabled
    ON training_configs (enabled, schedule_hour_utc);

CREATE TABLE IF NOT EXISTS training_jobs (
    job_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'dispatched', 'running', 'succeeded', 'failed', 'rejected')),
    created_at_unix_ms BIGINT NOT NULL,
    updated_at_unix_ms BIGINT NOT NULL,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    document JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS training_jobs_agent_recent
    ON training_jobs (org_id, agent_id, created_at_unix_ms DESC);
CREATE INDEX IF NOT EXISTS training_jobs_status
    ON training_jobs (status, created_at_unix_ms);
-- At most one active job per agent; the scheduler relies on this to stay idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS training_jobs_one_active_per_agent
    ON training_jobs (org_id, agent_id)
    WHERE status IN ('queued', 'dispatched', 'running');

CREATE TABLE IF NOT EXISTS training_versions (
    version_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    number INTEGER NOT NULL CHECK (number > 0),
    status TEXT NOT NULL CHECK (status IN ('live', 'shipped', 'rejected')),
    job_id TEXT NOT NULL,
    created_at_unix_ms BIGINT NOT NULL,
    document JSONB NOT NULL,
    UNIQUE (org_id, agent_id, number)
);
CREATE INDEX IF NOT EXISTS training_versions_agent_recent
    ON training_versions (org_id, agent_id, number DESC);
-- Exactly one version can be live per agent.
CREATE UNIQUE INDEX IF NOT EXISTS training_versions_one_live_per_agent
    ON training_versions (org_id, agent_id)
    WHERE status = 'live';
