-- x402 payment receipts and per-request usage metering.

CREATE TABLE IF NOT EXISTS payment_receipts (
    receipt_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agent_id TEXT,
    route TEXT NOT NULL,
    amount_usdc_micro BIGINT NOT NULL CHECK (amount_usdc_micro >= 0),
    network TEXT NOT NULL,
    asset TEXT NOT NULL,
    pay_to TEXT NOT NULL,
    payer TEXT,
    tx_hash TEXT,
    facilitator_raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_receipts_org_created_idx
    ON payment_receipts(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
    event_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    route TEXT NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT false,
    receipt_id TEXT REFERENCES payment_receipts(receipt_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_org_created_idx
    ON usage_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_org_route_idx
    ON usage_events(org_id, route);
