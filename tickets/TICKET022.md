# TICKET022 — Production secret management and redact-only configuration surfaces

- **Status:** Done (2026-06-12)
- **Priority:** P2

## Goal
Implement a robust, redact-only configuration inventory for credentials and secrets (`lib/env/` or `lib/deployment/`) to ensure no production keys are ever logged or displayed in diagnostic views.

## Context
SignalStack SMS has operations surfaces under `/settings` and `/settings/provider` that display system status. To be Phase 2 pilot-ready, we must ensure that any live keys (e.g. Twilio tokens, database connection passwords, AI keys) are completely redacted (e.g., replaced with `********` or displaying only trailing characters) in all views, logs, and trace exports.

## Scope
- **In:** Redaction helpers, settings API responses sanitization, environment checks, secret scanning rules.
- **Out:** Storing secrets in cleartext in database tables; live billing integrations.

## Likely files
`lib/env/defaults.ts`, `app/api/settings/provider/route.ts`, `scripts/secrets-scan.ts`, `tests/unit/operations/settings-surface-allowlist.test.ts`.

## Steps
1. Create a centralized `redactSecret(secret: string): string` helper under `lib/env/redact.ts`.
2. Inspect environment variable retrieval routines and ensure all config routes (e.g. `/api/settings/provider`) apply this redaction helper to Twilio credentials, Clerk keys, and database strings before returning them in JSON.
3. Validate that diagnostic logs in the application runner redact any connection URLs or auth headers.
4. Update unit tests to assert that sensitive parameters are not present in raw format within any api responses.
5. Verify secrets scan gate is green: `npm run secrets:scan`.

## Acceptance criteria
- [ ] Centralized redactSecret utility handles blank, short, and standard secret strings correctly.
- [ ] Settings API endpoints redact all credential fields.
- [ ] No cleartext secrets are printed to stdout/stderr in server runtime.
- [ ] Unit tests cover settings redaction verify success.
- [ ] `npm run validate` runs and exits 0.

## Commands
`npm test -- settings-surface`, `npm run validate`

## Risks
Redacting too aggressively might break config validations. Mitigated by only redacting output/representation boundaries, keeping real values in memory.

## Notes
A crucial safety step before any production or staging deployment.
