-- Every externally observable control-plane mutation creates an event in this
-- table in the same transaction. A publisher worker later delivers it to NATS
-- JetStream, eliminating dual-write loss between Postgres and the message bus.
CREATE TABLE IF NOT EXISTS event_outbox (
    event_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    payload BYTEA NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS event_outbox_ready_idx
    ON event_outbox (available_at, created_at)
    WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS event_outbox_org_created_idx
    ON event_outbox (org_id, created_at DESC);
