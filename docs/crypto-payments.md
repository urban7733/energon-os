# Crypto Payments

Energon OS is crypto-only for paid usage. The first supported API payment rail is
x402: agents request a paid endpoint, the API returns `402 Payment Required`, the
agent signs/pays with a wallet, and the API verifies/settles before returning
memory or context.

This repository only owns the memory/API enforcement boundary. Wallet custody,
treasury automation, accounting, subscription checkout, and broader payment
orchestration belong in separate services or repositories.

## x402 Configuration

```txt
ENERGON_X402_ENABLED=true
ENERGON_X402_PAY_TO=0xYourReceivingAddress
ENERGON_X402_NETWORK=eip155:84532
ENERGON_X402_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e
ENERGON_X402_FACILITATOR_URL=https://x402.org/facilitator
ENERGON_X402_FACILITATOR_BEARER=<optional facilitator bearer token>
```

The defaults target Base Sepolia testnet (`eip155:84532`, testnet USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`).

Use only a public receiving address in `ENERGON_X402_PAY_TO`. Never commit a
private key, seed phrase, wallet backup, or exchange login secret.

## Switching to Base Mainnet (real USDC)

To receive real payments, flip exactly two env vars — no code changes:

```txt
ENERGON_X402_NETWORK=eip155:8453
ENERGON_X402_ASSET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

`0x8335...2913` is the canonical USDC contract on Base mainnet. Keep
`ENERGON_X402_PAY_TO` pointed at a wallet you control on Base. The facilitator
(`ENERGON_X402_FACILITATOR_URL`) must support the selected network; the default
`https://x402.org/facilitator` supports Base Sepolia, and mainnet settlement
typically requires a facilitator with credentials
(`ENERGON_X402_FACILITATOR_BEARER`).

## Paid Routes and Pricing

Prices are configured per route via env vars (values are micro-USDC; defaults
shown):

```txt
POST /v1/memory/write                    ENERGON_PRICE_MEMORY_WRITE_MICRO=1000
POST /v1/memory/promote                  ENERGON_PRICE_MEMORY_PROMOTE_MICRO=1000
POST /v1/context/build                   ENERGON_PRICE_CONTEXT_BUILD_MICRO=3000
GET  /v1/audit/context/{request_id}      ENERGON_PRICE_AUDIT_READ_MICRO=500
GET  /v1/audit/promotion/{memory_id}     ENERGON_PRICE_AUDIT_READ_MICRO=500
GET  /v1/vault/obsidian.zip              ENERGON_PRICE_VAULT_EXPORT_MICRO=5000
```

## Receipts and Usage Metering

With Postgres storage active:

- Every successful x402 settle writes a `payment_receipts` row: route, amount,
  network, asset, pay-to address, payer and transaction hash (when the
  facilitator reports them), and the full raw facilitator response as JSONB.
- Every paid-route call — whether actually paid or served in free mode —
  records a `usage_events` row linked to the receipt when one exists.
- `GET /v1/orgs/{org_id}/usage` (operator JWT) returns per-route call counts,
  paid counts, settled micro-USDC totals, and the most recent receipts.

Receipt persistence happens after settlement; a persistence failure is logged
but never voids an already-settled payment. With in-memory storage (no
`DATABASE_URL`), usage counters are kept in process memory only and receipts
are not persisted — use Postgres in production.

## Local Development

For local dashboard testing without an onchain payment:

```txt
ENERGON_X402_ACCEPT_UNVERIFIED=1
```

That mode accepts any non-empty `PAYMENT-SIGNATURE` and must not be used in
production.
