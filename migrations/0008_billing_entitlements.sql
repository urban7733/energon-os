-- Human-operated plan purchases. A purchase is verified against a Base USDC
-- transfer before it creates or extends an organization entitlement.

CREATE TABLE IF NOT EXISTS billing_checkout_intents (
    intent_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
    operator_user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL CHECK (plan_id IN ('developer', 'team')),
    amount_usdc_micro BIGINT NOT NULL CHECK (amount_usdc_micro > 0),
    network TEXT NOT NULL,
    asset TEXT NOT NULL,
    pay_to TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    payer TEXT,
    tx_hash TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS billing_checkout_intents_org_created_idx
    ON billing_checkout_intents(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS org_entitlements (
    org_id TEXT PRIMARY KEY REFERENCES orgs(org_id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL CHECK (plan_id IN ('developer', 'team')),
    included_operations BIGINT NOT NULL CHECK (included_operations > 0),
    used_operations BIGINT NOT NULL DEFAULT 0 CHECK (used_operations >= 0),
    active_from TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    source_intent_id TEXT NOT NULL REFERENCES billing_checkout_intents(intent_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_entitlements_active_idx
    ON org_entitlements(expires_at);
