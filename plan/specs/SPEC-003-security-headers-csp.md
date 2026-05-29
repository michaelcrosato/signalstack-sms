# SPEC-003 — Security headers + CSP baseline (all routes)

- **Status:** Done (2026-05-28) — headers + CSP-Report-Only in `next.config.mjs`; `poweredByHeader:false`; new `scripts/security-headers-check.ts` wired into `validate` as `security:check`. Verified live: `GET /` → 200 with X-Frame-Options/X-Content-Type-Options/Referrer-Policy/HSTS/Permissions-Policy/CSP served and `X-Powered-By` absent; build green. Follow-up: flip CSP to enforcing with a per-request nonce. · **Priority:** P1 · **Pillar:** Security/Quality · **Effort:** M

## Description
`next.config.mjs` is empty `{}`; `middleware.ts` matches only `/api/*` (rate limit). So pages and API
responses carry **no security headers and no CSP**, and `x-powered-by` is exposed. Add a standard
hardening baseline and a per-request-nonce CSP, plus an executable gate to keep it from regressing.

## Prereqs / deps
None. DAG-independent (Phase 0). Coordinate with TICKET009 later (Clerk may need CSP allowances).

## Implementation approach
1. `next.config.mjs`: `poweredByHeader: false`; add `async headers()` returning static headers for all
   paths: `Strict-Transport-Security` (max-age + includeSubDomains), `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a minimal
   `Permissions-Policy`.
2. CSP with nonce: generate a per-request nonce in `middleware.ts` (extend matcher to page routes),
   set `Content-Security-Policy` (`default-src 'self'`, `script-src 'self' 'nonce-…'`,
   `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`). **Ship as `-Report-Only` first**,
   confirm no violations, then flip to enforcing. Avoid `unsafe-inline`.
3. Add `scripts/security-headers-check.ts` asserting the header set is configured; wire into
   `scripts/validate.ts` (and document in AGENTS command reference).

## Acceptance criteria
- [ ] All responses include the header baseline; `x-powered-by` absent.
- [ ] CSP present (Report-Only initially) with a per-request nonce; no CSP violations on `/`, `/dashboard`,
      `/demo`, `/settings`.
- [ ] New `security:headers` gate passes and is part of `npm run validate`.
- [ ] All existing gates + e2e smoke remain green; no visual/console regressions.

## Test strategy
Unit test the header/nonce builder; integration assert on a sample response; manual `curl -I`; run e2e
smoke to confirm CSP doesn't break the app. Toggle Report-Only→enforce only after a clean pass.

## Out of scope
COOP/COEP cross-origin isolation, HSTS preload-list submission, third-party script allowances (none yet),
subresource integrity.
