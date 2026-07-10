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

Base Sepolia testnet uses `eip155:84532`. Base mainnet uses `eip155:8453`.
Set the asset to the USDC contract for the selected network.

Use only a public receiving address in `ENERGON_X402_PAY_TO`. Never commit a
private key, seed phrase, wallet backup, or exchange login secret.

## Paid Routes

```txt
POST /v1/memory/write                    1000 micro-USDC
POST /v1/memory/promote                  1000 micro-USDC
POST /v1/context/build                   3000 micro-USDC
GET  /v1/audit/context/{request_id}       500 micro-USDC
GET  /v1/audit/promotion/{memory_id}      500 micro-USDC
GET  /v1/vault/obsidian.zip              5000 micro-USDC
```

## Local Development

For local dashboard testing without an onchain payment:

```txt
ENERGON_X402_ACCEPT_UNVERIFIED=1
```

That mode accepts any non-empty `PAYMENT-SIGNATURE` and must not be used in
production.
