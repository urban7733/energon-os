# Security Policy

## Supported versions

Security fixes are provided for the latest release on `main`.

## Reporting a vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

Email **security@energon.os** with:

- a description of the issue
- steps to reproduce
- affected endpoints or components
- potential impact (data exposure, permission bypass, audit tampering, etc.)

We aim to acknowledge reports within 72 hours.

## Scope

In scope:

- permission bypass in memory retrieval or context packing
- cross-agent or cross-tenant memory leakage
- authentication or API key handling flaws
- audit log tampering or omission
- Obsidian vault export bypassing permission filters

Out of scope:

- vulnerabilities in external agent runtimes
- wallet custody or private key handling outside this repository
- denial-of-service against demo or in-memory local setups without production deployment context

## Built-in protections

| Threat | Protection |
| --- | --- |
| SQL injection | Every query uses bound sqlx parameters; no request value is ever formatted into SQL. |
| XSS | React escapes all rendered data; inline JSON-LD escapes `<`, `>`, `&`; a strict Content-Security-Policy limits scripts and blocks connections to unknown origins; explorer links must be `https:`. |
| Clickjacking | `frame-ancestors` and `X-Frame-Options` (`DENY` on the API, same-origin only on the web app). |
| Credential guessing | Per-IP budget of failed authentications on the API; tight Better Auth limits on sign-in, sign-up, and password routes. |
| Timing attacks | The admin token is compared in constant time; API keys are looked up by peppered hash. |
| Rate-limit evasion | Only the proxy-appended (rightmost) client IP is trusted; see `ENERGON_CLIENT_IP_HEADER`. |
| Information leaks | Internal errors return a generic message; foreign audit records and dreams answer exactly like missing ones; API responses are `no-store`. |
| Payment replay | Checkout transaction hashes are canonicalized to lowercase and unique in the database. |
| Oversized or hostile input | Identifiers use a fixed character set and length; content, tags, reasons, and bodies are size-limited; handlers time out. |
| Account takeover via OAuth linking | GitHub logins only link to password accounts whose email is verified. |
| SDK key exposure | SDKs require HTTPS (except loopback or explicit opt-in) and never follow redirects. |
| Vulnerable dependencies | `cargo audit` and `bun audit` run on every PR and weekly; Dependabot proposes updates. |
| Container escape impact | API, worker, and web images run as unprivileged users. |

## Production checklist

- set `ENERGON_ENV=production`; startup then refuses unsafe settings
- set `ENERGON_API_KEY_PEPPER` and `BETTER_AUTH_SECRET` to long random values
  (`openssl rand -base64 32`)
- use `ENERGON_ADMIN_TOKEN` only to bootstrap, then remove it
- set `ENERGON_CLIENT_IP_HEADER` to your proxy's client IP header (`x-real-ip`
  on Railway, `cf-connecting-ip` on Cloudflare), or `none` without a proxy
- set `ENERGON_WEB_ORIGIN` and `NEXT_PUBLIC_ENERGON_API_BASE_URL` to the exact
  HTTPS origins; the web CSP only allows the configured API origin
- never commit `.env`, private keys, seed phrases, or wallet backups
- do not use `ENERGON_X402_ACCEPT_UNVERIFIED=1` in production
- use Postgres-backed storage for production; in-memory mode is for local demos
  only and trusts identity headers
