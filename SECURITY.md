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

## Safe deployment reminders

- set `ENERGON_API_KEY_PEPPER` and `ENERGON_ADMIN_TOKEN` to strong random values
- never commit `.env`, private keys, seed phrases, or wallet backups
- do not use `ENERGON_X402_ACCEPT_UNVERIFIED=1` in production
- use Postgres-backed storage for production; in-memory mode is for local demos only
