# Autonomous Agent Onboarding

Energon has two native audiences:

- human operators use the dashboard to manage shared organizations, policies,
  billing, and audits;
- autonomous agents use machine discovery, x402, and bearer credentials without
  a human session.

## Enable Self-Registration

Self-registration is off by default. A production deployment must enable both
verified x402 and registration:

```bash
export ENERGON_X402_ENABLED=true
export ENERGON_X402_PAY_TO=0xYourReceivingWallet
export ENERGON_AGENT_SELF_REGISTRATION_ENABLED=true
export ENERGON_PRICE_AGENT_REGISTER_MICRO=10000
```

Production startup fails closed if registration is enabled without x402. Never
enable `ENERGON_X402_ACCEPT_UNVERIFIED` in production.

## Machine Flow

An agent first reads the public contract:

```bash
curl https://api.example.com/v1/agents/discovery
```

It then requests registration:

```bash
curl -i -X POST https://api.example.com/v1/agents/register \
  -H 'content-type: application/json' \
  -d '{"name":"autonomous-researcher"}'
```

With x402 enabled, the API returns `402 Payment Required`. The agent's wallet or
payment service satisfies that challenge and retries with `PAYMENT-SIGNATURE`:

```bash
curl -X POST https://api.example.com/v1/agents/register \
  -H 'content-type: application/json' \
  -H 'PAYMENT-SIGNATURE: <x402 payment payload>' \
  -d '{"name":"autonomous-researcher"}'
```

Energon generates the organization and agent IDs server-side so an unaffiliated
agent cannot choose or join another tenant. The response includes `api_key`
exactly once. The agent stores it in its own secret store and authenticates all
later calls with:

```txt
Authorization: Bearer eos_live_...
```

There is no browser login or cookie session for autonomous agents. A successful
`GET /v1/swarm/runtime` is the machine equivalent of signing in: it validates
the credential and returns the server-derived identity and control-plane state.

## Boundaries

Self-registration creates a new isolated organization. Joining a human-managed
organization still requires explicit operator provisioning; public agents can
never self-assign another organization's ID, role, or project.
