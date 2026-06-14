# SignalStack SMS — Engineering Review

_Reviewer: senior engineer, top-to-bottom read of the product. Date: 2026-06-14. Branch reviewed: `chore/template-reset-20260614` (product code identical to `develop`)._

This is a candid, evidence-backed review. Findings cite `file:line`. Aspirational claims are separated from working code. Nothing here is cheerleading.

---

## Verdict

**Grade: C+ (a competent, honest demo skeleton — not a shippable SMS product).**

SignalStack is one of the more *honest* AI-generated codebases I have reviewed: it is explicit that every real-world side effect (live SMS, billing, AI, production auth, workers, deploy) is gated **off by default**, and the gating is real executable code, not comments. The webhook signature verification is genuinely correct (constant-time HMAC-SHA1). The credential handling is genuinely good (tokens are SHA-256 fingerprinted, never stored or logged). The test suite is ~65-70% real coverage of the compliance core. The schema is coherent and consistently `orgId`-scoped.

But strip away the gates and ask "does this actually work as a multi-tenant SMS platform?" and the answer is no. The headline problems: (1) the product's own quality gate has been **de-wired** — none of the ~12 custom product checks (compliance, contracts, production-gate, secrets) are invoked by `verify.sh` or CI anymore; (2) the live send paths **bypass the central compliance gate** the contract requires, so opt-out / consent-evidence / quiet-hours are not enforced where it counts; (3) **inbound webhooks have no multi-tenant routing** — every inbound message lands in the single demo org, and under production auth they 500; (4) **Postgres RLS is a façade** — present in a migration but off by default and ignored by most repositories; (5) the README documents a setup that **does not exist**. The git history is a squashed bulk-dump (one commit `e9e79ead` contains essentially the entire product), so there is no real incremental-development trail, and the "many unmerged feature branches" are almost all bookkeeping artifacts, not stranded code.

It demos well. It is nowhere near production. The grade is propped up by genuine craftsmanship in the gate/crypto/test layers and dragged down by the de-wired gate plus structural send-path and tenancy gaps that the (now-dormant) checks were supposed to catch.

---

## What this actually is

A Next.js 15 (App Router) + TypeScript SMS marketing / shared-inbox / lead-qualification SaaS, demo-safe by construction:

- **181 source files, ~18,200 LOC** under `src/` (`find src -name '*.ts*' | wc -l` = 181; LOC via `wc -l`).
- **99 test files, 2,008 `expect()` assertions** (vitest) + 3 Playwright e2e specs.
- Default posture: `MESSAGING_PROVIDER=dummy`, `AI_PROVIDER=fake`, `LIVE_*` flags off, `PRODUCTION_AUTH_ENABLED` off, demo session = a hardcoded OWNER on a single demo org.
- The **only** intended live path is `/api/demo/live-test-sms` — a heavily multi-gated single-recipient investor-demo SMS.

Working today (in demo mode): contacts CRUD + CSV import, segments, templates, campaign draft → preflight → schedule, a DB-polling worker that "sends" via the dummy provider, a shared inbox with STOP/START consent handling, deterministic "fake AI", local usage counters, and ~10 read-only operations surfaces.

Aspirational / dormant: live Twilio sending, real billing/Stripe, live Claude AI (implemented but gated off), production Clerk auth (implemented but unsafe — see Security), BullMQ in production, RLS enforcement, dead-letter queues, rate-limited live workers.

---

## Architecture

```
                 ┌─────────────────────────── Next.js (App Router) ───────────────────────────┐
 Browser ──────▶ │  /dashboard, /settings, /demo (RSC + client forms)                          │
                 │  /api/* route handlers ── zod validate ── requireApiRole ── repository layer │
                 └───────────┬───────────────────────────────────────────────┬────────────────┘
                             │                                                 │
                    Prisma (singleton)                                provider abstraction
                             │                                       getMessagingProvider(name)
                             ▼                                          ├─ dummyProvider (default)
                    PostgreSQL  ◀── 21 migrations                       └─ twilioProvider (real HTTP, gated)
                    (RLS migration present but OFF)
                             ▲
              durable QueueJob rows
                             │
   POST /campaigns/:id/schedule ──▶ writes QueueJob ──▶ (optionally) enqueueScheduledCampaignBullMqJob (no-op by default)
                             │
              ┌──────────────┴───────────────┐
   workers/index.ts (DB poller)      workers/bullmq.ts (BullMQ → Redis)
   `npm run worker`                  `npm run worker:bullmq` (QUEUE_BACKEND=bullmq + REDIS_URL)
              └──────────────┬───────────────┘
                             ▼  both delegate into src/lib/queue/worker.ts
                   processScheduledCampaignQueueJob → dummyProvider.send → Message rows

   Twilio ──▶ /api/webhooks/twilio/{inbound,status} ── HMAC-SHA1 verify ── recordWebhookEvent (idempotent) ── DB
```

- **Web + workers + queue + DB + provider adapter** are all present and mostly real. The seams between them are the problem (see below), not the boxes themselves.
- **Two queue implementations coexist**: a DB-polling worker (`src/lib/queue/worker.ts`, the default, run by `workers/index.ts`) and a real BullMQ worker (`src/lib/queue/bullmq-worker.ts`, `workers/bullmq.ts`, off unless `QUEUE_BACKEND=bullmq` + `REDIS_URL`). Both delegate to the same DB worker logic. The schedule route enqueues to BullMQ but **ignores the result** (`src/app/api/campaigns/[campaignId]/schedule/route.ts:38`), so when BullMQ is disabled the enqueue silently no-ops and only the DB poller drains the job. Confusing dual path; mostly self-heals because both read the same `QueueJob` row.
- **Nothing runs a worker in-process.** With defaults, an operator must manually launch `npm run worker`; there is no cron/in-app trigger. Scheduled campaigns sit as `QUEUED` rows until someone starts the poller.

---

## Contracts vs implementation

There are 9 `contracts/CONTRACT-*.md` (945 lines total). They are unusually detailed. The code honors most of them in demo mode; the gaps appear precisely where the contract promises *enforcement on the live path*.

| Contract | Honored? | Key gap (file:line) |
|---|---|---|
| PROVIDER-ADAPTER | **Partial — violated** | L11: "send entrypoints must call `evaluateMessagingHardGate` before any external provider mutation." `dummy-provider.ts:3-11` calls **no** gate; `src/lib/queue/worker.ts:344-372` (the bulk sender) **never imports/calls** the gate; `twilio-provider.ts:18-23` calls it but passes **no `contact`**, so all contact-level checks are skipped. |
| WEBHOOKS | **Partial** | Signature verify is correct (`twilio-webhooks.ts:69-105`). But L34 "handlers must not send SMS replies" is violated in code (`inbox.ts:90,138` send STOP/START confirmations via the provider — no-op only because of dummy default). No replay/freshness protection. Inbound never maps `To`→tenant. |
| COMPLIANCE | **Partial — violated** | L47-48: contact-level consent/opt-out and worker-side recheck "remain required even if config gates pass." The live `twilio-provider.ts` and the campaign `worker.ts` do not run the contact-level gate; quiet-hours is **0% live** (no send path passes `quietHours`). State-window overrides (`quiet-hours.ts:14-20`) are dead — `Contact` has no `state` column (`prisma/schema.prisma`). |
| BILLING | **Honored (narrow)** | The contract only promises local counters, no Stripe — and that's all there is. But there is **no outbound-message/segment metering at all**: `UsageEventType` (`schema.prisma:71-76`) has no `MESSAGE_OUTBOUND`; the send path records `Message` rows but no usage. So "billing" can't bill for the one thing an SMS product sells. |
| AI | **Honored, with omission** | Real Claude integration exists (`provider.ts:182-372`, model `claude-haiku-4-5-20251001` — current/valid), gated off by default; routes validate input and never auto-send. Contract omits the `analyzeConversationSentiment` capability that exists in code but has **no route** (orphaned). |
| QUEUE | **Partial** | Idempotency keys ✓, BullMQ jobId = durable key ✓. Missing: backoff (`bullmq.ts:52` sets `attempts:3` but **no `backoff`**), dead-letter queue, emergency stop, rate limiting — all `status:"planned"` in `live-worker-controls.ts`. ~470 lines hardening a permanently-disabled live-worker authorizer is effort badly misallocated vs. the missing primitives. |
| DB | **Partial** | All tenant models carry `orgId` ✓. But isolation is app-level `WHERE orgId` only; RLS is off (see Security). One genuinely unscoped write: `inbox.ts:262` `conversation.update({ where:{ id } })` with no `orgId`. |
| API | n/a | Endpoint inventory doc; `contracts-check.ts` compares it to routes (see below) but the check is buggy and de-wired. |
| TESTING | **Mostly** | Real assertion-shield + route-authorization lint exist; but 6 test files hit a live Postgres ungated, so `npm test` is not hermetic. |

---

## Code quality & correctness

Generally clean: **0 TODO/FIXME/HACK/XXX**, **1 `as any`**, **1 `console.log`** across all of `src/` + `workers/`. TypeScript is strict-ish. Naming is consistent. But several real defects:

1. **Send path bypasses compliance gate (TCPA exposure).** `src/lib/queue/worker.ts:344-372` and `src/lib/messaging/provider/dummy-provider.ts:3-11` never call `evaluateMessagingHardGate`; `src/lib/messaging/provider/twilio-provider.ts:18-23` calls it without a `contact`, so `CONTACT_OPTED_OUT`, `CONSENT_EVIDENCE_MISSING`, and quiet-hours (`src/lib/compliance/gates.ts:63-94`) never execute on a live send. Today the org-level gates happen to block, but the contact-level guarantees are structurally absent.
2. **No multi-tenant webhook routing.** `src/app/api/webhooks/twilio/inbound/route.ts:34` and `.../status/route.ts:36` call `getOrCreateCurrentOrg()` with **no request**. In demo mode every inbound, regardless of the Twilio `To` number, is attributed to the one demo org (`current-org.ts:67-93`); `payload.To` is never used to resolve the tenant despite a `ProviderPhoneNumber` model existing. Under production auth, Twilio sends no Clerk token → `current-org.ts:55-57` throws → unhandled 500. There is no working production inbound path.
3. **Status webhook `updateMany` on a non-unique key.** `src/app/api/webhooks/twilio/status/route.ts:56` updates by `(orgId, providerMessageId)`, but `providerMessageId` is only `@@index`ed, not unique (`schema.prisma:394`). Two rows sharing a SID get clobbered together. No status-monotonicity guard, so an out-of-order `sent` webhook overwrites `delivered`.
4. **`contracts-check.ts` has inverted logic (bug).** `scripts/contracts-check.ts:226`: `apiDocs.some((doc) => !doc.includes(endpoint))` flags an endpoint as "undocumented" whenever **either** of the two docs lacks it — `.some(!includes)` is true if any single doc is missing the string. The intent was clearly "documented in none." Even fixed, it only substring-matches endpoint strings; it does not verify request/response shapes against the contract.
5. **CSV formula injection on export.** `src/app/api/contacts/segments/export/route.ts:62-68` quotes only `, " \n`; it does not neutralize leading `= + - @`. A contact named `=cmd|'/c calc'!A1` exports an active formula that executes when the operator opens the CSV. The import side is fine.
6. **Type lie in the provider.** `MessageSendResult.status` is `"queued" | "blocked"` (`provider/types.ts:11-14`) but `twilio-provider.ts:72,76` computes `"accepted"` and casts it through. The adapter is also **not idempotent against Twilio** — it re-POSTs on every call and drops the idempotency key from the result; dedup lives entirely in DB-layer callers.
7. **Test-mock cruft in production route.** `src/app/api/webhooks/twilio/status/route.ts:46-53` branches on `typeof prisma.message.findFirst === "function"` to accommodate a mocked Prisma — dead-in-prod defensive code in a request handler.
8. **Dead code:** `src/lib/db/tenant.ts:5-15` `assertSameOrg` (defined, never used); `src/lib/ai/fake-ai-provider.ts:63-67` `assertFakeAiProvider` (never called); the entire RLS path in production runtime; per-state quiet-hours windows.

---

## Tests (real coverage or theater?)

**Verdict: ~65-70% real, ~20-25% low-value change-detectors, ~10% latent-broken/env-coupled.** Not theater — the parts that matter for an SMS compliance product are genuinely well-tested.

- **99 files, 2,008 assertions, 0 skipped/only/todo.** No coverage thresholds anywhere; `vitest.config.ts` `include` is `tests/**/*.test.ts` only, so `src/` is never measured for coverage.
- **Genuinely strong:** HMAC signature + unknown-field sensitivity (`tests/unit/messaging/twilio-webhooks.test.ts:71-107`); real Next route handlers asserting 400/403/204 + idempotency (`tests/unit/api/twilio-webhook-routes.test.ts:77-128`); compliance gate combinatorics (`tests/unit/compliance/hard-gates.test.ts:35-82`); a static lint test that walks every `route.ts` and asserts mutating handlers are role-gated (`tests/unit/auth/api-route-authorization.test.ts:20-90`); the e2e demo-path actually drives the app through import → campaign → inbox STOP/HELP (`e2e/product-demo-path.spec.ts:96-396`).
- **Theater / vanity:** ~201 assertions (~10%) are `Object.isFrozen(...)` + `toThrow(TypeError)` change-detectors pinning static label strings and array order in `tests/unit/operations/*` and `tests/unit/product/*` (e.g. `security-operations.test.ts:43-90` asserts `controlCount === 4` and hand-typed control names — proves nothing about runtime). The largest files by assertion count are the lowest value.
- **Integrity gap:** 6 test files make **ungated live-Postgres** calls (`await prisma.X.create(...)`) with no mock and no `RUN_DB_TESTS` guard — `tests/unit/compliance/{double-opt-in,auto-responder}.test.ts`, `tests/unit/ai/sentiment-analysis.test.ts`, `tests/unit/product/segment-sync.test.ts`, `tests/unit/validation/template-preview.test.ts`, `tests/unit/observability/prometheus.test.ts`. So `npm test` is **not hermetic** on a clean checkout — it needs a primed Postgres. The disciplined `rls-isolation.test.ts:8-10` shows they knew the right pattern and didn't apply it.
- **No test exercises a real SMS/AI provider.** Everything past the gate is mock-verified only.
- Genuine guardrail: `scripts/assertion-shield.ts` (226 lines) blocks commits that delete/weaken assertions, and CI re-runs the gate.

---

## Security, compliance & data handling

**Strengths (real):**
- Webhook signature verification is correct: canonical-string reconstruction + `createHmac("sha1", token)` + `timingSafeEqual` with length pre-check (`src/lib/messaging/twilio-webhooks.ts:83-104`), fail-closed, called before any mutation (403 on failure).
- Credentials are **never stored**: only `accountSidLast4`, redacted SID, and a SHA-256 token **fingerprint** are persisted (`src/lib/db/repositories/provider-credentials.ts:88-115`). Raw token comes from env only and is used solely to build a Basic-auth header.
- A thorough log redactor (key-denylist + regex for Clerk/Twilio/Bearer/DB-URL secrets) runs on every log line (`src/lib/observability/logger.ts:41-79`).
- The Clerk JWT verifier does **real** RS256 signature verification via WebCrypto (`src/lib/auth/clerk-verifier.ts:131-138`), with `exp`/`nbf` checks.

**Weaknesses (real):**
1. **JWT issuer/audience not validated (auth-bypass class).** `verifyClerkToken(token)` is called with no options (`current-org.ts:59`, `middleware.ts:62`), so the issuer check (`clerk-verifier.ts:85`) is skipped and the **JWKS URL is derived from the attacker-controlled `iss` claim** (`clerk-verifier.ts:94`). No issuer allowlist, no `aud` check. An attacker who controls a host can serve their own JWKS and mint a "valid" token. The production auth path is **not safe to enable as-is**. Worse, production auth is **off by default**, so any deploy that forgets `PRODUCTION_AUTH_ENABLED=true` is fully open (OWNER-for-everyone via the demo session).
2. **RBAC is enforced by convention, not a chokepoint.** `src/lib/auth/api-rbac-matrix.ts` is a frozen data table consumed only by a test — nothing enforces it at runtime. Each route must remember to call `requireApiRole` (`api-authorization.ts:6-14`). Middleware does rate-limiting + coarse auth only, no roles. Found ungated reads: `src/app/api/settings/provider/rotations/route.ts:7` and `.../rotations/export/route.ts:8` expose the credential-rotation audit trail (last-4s, actor IDs, fingerprint flags) to any MEMBER, though writes require ADMIN.
3. **RLS is a façade.** The migration enables `FORCE ROW LEVEL SECURITY` on 22 tables, but the policy is permissive when the session var is unset (`prisma/migrations/20260529130000_tenant_rls/migration.sql:42-43`), the app only sets the var inside `withTenantRls` (`src/lib/db/rls.ts:13-24`), which is a **no-op unless `DATABASE_RLS_ENFORCED==="true"`** (`rls.ts:26-28`) — and that env var is **set nowhere**. It's wired into only 4 routes, and the repos those routes call largely ignore the `tx` (campaigns/inbox repos take no `tx` at all). Net isolation = app-level `WHERE orgId` + one unscoped write (`inbox.ts:262`).
4. **No CSRF protection.** Cookie-based `__session` auth (`middleware.ts:52`, `current-org.ts:29`) + state-changing POST/PATCH/DELETE, no CSRF token, no Origin/Referer check. Exploitable once production auth is on.
5. **CSP is Report-Only with `unsafe-inline`** (`next.config.mjs`) — zero XSS protection — and the header gate can't tell (`scripts/security-headers-check.ts:14` greps the substring). Spoofable rate-limit client key trusting `x-forwarded-for` (`src/lib/rate-limit/api-rate-limit.ts:89-107`). Unsalted SHA-256 fingerprint (acceptable for change-detection only).
6. **PII to the LLM:** prompts redact only phone-like digit runs (`provider.ts` via `logger.ts:31`); emails/names/addresses in message bodies are sent to Anthropic unredacted (consistent with the narrow contract wording, but oversells "strip raw PII").

---

## THE DE-WIRED PRODUCT GATE (most important operational finding)

**The product's entire custom quality gate is disconnected and nobody would notice.**

The repo ships ~12 bespoke product-check scripts in `scripts/`: `compliance-check.ts`, `contracts-check.ts`, `production-gate.ts`, `production-auth-rbac-check.ts`, `production-worker-policy-check.ts`, `observability-check.ts`, `operator-runbook-check.ts`, `platform-notes-check.ts`, `context-budget-check.ts`, `security-headers-check.ts`, `ai-check.ts`, `secrets-scan.ts`. They are all wired into `package.json` (`compliance:check`, `contracts:check`, `production:gate`, … `secrets:scan`, plus `validate` which calls several of them).

When the operations-engine template was reinstalled (commit `09b87911`, 2026-06-11), it overwrote the engine-owned `scripts/verify.sh` with a generic version that auto-detects only `typecheck`/`lint`/`test`/`build` + engine meta-gates (state-validate, assertion-shield, biome/shellcheck on the engine layer, hook tests). **It calls none of the product checks.** Verified:

- `grep -nE 'compliance:check|contracts:check|production:gate|secrets:scan|validate' scripts/verify.sh` → **no matches**.
- `.github/workflows/ci.yml:43` runs **only** `bash scripts/verify.sh` plus an inline secret grep — it never runs `npm run validate` or any product check.
- `npm run validate` (`scripts/validate.ts`, the only thing that would invoke `secrets-scan.ts` / `compliance-check.ts` / `contracts-check.ts`) is referenced by **nothing** in `verify.sh` or CI.

**Consequence:** the product can be green on `verify.sh` and CI while:
- shipping the compliance-gate bypass on the send path (`compliance-check.ts` was meant to assert this — though note even that script is mostly theater: it only greps `.env.example` and checks the string `"CONSENT_EVIDENCE_MISSING"` exists in `gates.ts`; it cannot detect that the gate is never called);
- adding an API endpoint that diverges from the contract (`contracts-check.ts` is meant to catch drift — though it has the inverted-logic bug noted above);
- regressing production-deploy guards, RBAC coverage, security headers, AI no-send invariants, or leaking a Twilio/Stripe/Clerk-shaped secret (the CI inline grep covers a *different* set — `sk-ant`, AWS, PEM, GitHub PATs — so there is a real coverage gap for provider keys).

This is a silent erasure of the product's self-defense. **Re-wiring it is the #1 fix** (see Top 5).

---

## Unmerged branches

The "many unmerged `feat/F-*` branches" are mostly an illusion of an AI factory loop. Verified with `git merge-base --is-ancestor <branch> develop` and `git diff --stat develop...<branch>`:

| Branch | Ahead of develop | Real product code? | Status / recommendation |
|---|---|---|---|
| feat/F-0001 | 0 commits | — | Already an ancestor of develop. **Delete (abandon branch ref).** |
| feat/F-0004 | 0 commits | — | Ancestor of develop. **Delete.** |
| feat/F-0007 | 0 commits | — | Ancestor of develop (tip shared with F-0008/F-0009). **Delete.** |
| feat/F-0008 | 0 commits | — | Ancestor of develop. **Delete.** |
| feat/F-0009 | 0 commits | — | Ancestor of develop. **Delete.** |
| feat/F-0010 | 0 commits | — | Ancestor of develop. **Delete.** |
| feat/F-0011 | 0 commits | — | Ancestor of develop. **Delete.** |
| feat/F-0005 | 1 commit | **No** | Commit `82e91e0e` touches only roadmap bookkeeping (PROGRESS, briefs, evidence log, features.json, metrics). The CSV-import *code* is already in develop (added in the bulk commit `e9e79ead`). **Stranded RECORD-step state only.** Reconcile features.json/PROGRESS onto develop, then delete. |
| feat/F-0006 | 3 commits | **No** | Commits `82e91e0e`+`c387e9ec`+`34149202`; diff vs develop is **only** PROGRESS/STATUS/briefs/evidence/features.json/metrics — **zero `src/` changes**. Campaign preflight/schedule code already in develop. **Stranded bookkeeping.** Same recommendation. |

**Net: 0 branches contain unmerged product code.** 7 branches are stale refs already in develop; 2 (F-0005/F-0006) carry only roadmap state that was never folded back — `develop`'s `features.json` already marks both `done` (11 done entries), so even the bookkeeping is largely redundant.

**Top recommendation:** delete all 9 local `feat/F-*` refs after confirming `develop` holds the merged code and the `done` statuses (it does). The real lesson is process: the RECORD step (state flip + PROGRESS) is riding feature branches that never merge, so durable state drifts from code. The bigger smell is the **squashed bulk history** — `e9e79ead` is a single commit containing nearly the entire product, which makes review, bisection, and blame impossible. This is not a healthy git history.

---

## Tech debt & risks (ranked)

1. **De-wired product gate** — `verify.sh`/CI run none of the product checks; the platform's self-defense is silently off.
2. **Compliance gate bypass on send paths** (`worker.ts`, `dummy-provider.ts`, `twilio-provider.ts` w/o contact) — opt-out/consent/quiet-hours not enforced where it matters. TCPA/legal exposure if ever flipped live.
3. **JWT issuer/audience not validated** — production auth path has an issuer-confusion bypass; auth is off-by-default so a forgotten flag = fully open.
4. **No multi-tenant webhook routing** — inbound pins to demo org or 500s under prod auth; not production-viable.
5. **RLS façade + one unscoped write** — isolation is app-level only; one refactor away from a cross-tenant leak.
6. **README documents a setup that doesn't exist** — `scripts/agent/bootstrap.sh`, `npm run agent:bootstrap`/`demo:seed`/`db:migrate`/`agent:check`, `plan/` dir all absent. A new dev cannot follow it.
7. **`npm test` non-hermetic** — 6 ungated live-DB test files; red on a clean machine.
8. **Queue reliability gaps** — no backoff, no DLQ, no job-claim locking (find-then-update race); dual queue path with ignored enqueue result.
9. **No outbound-message/segment metering** — "billing" cannot bill for sent SMS.
10. **CSV formula injection on export; CSP report-only; no CSRF; spoofable rate-limit key** — a cluster of medium web-security issues.
11. **Squashed bulk git history** — no incremental trail; impossible to bisect/blame.
12. **Effort misallocation** — ~470 lines hardening a permanently-disabled live-worker authorizer while basic reliability primitives are missing; ~200 frozen-array vanity test assertions.

---

## Top 5 to fix first

1. **Re-wire the product gate.** Add the product checks back into `scripts/verify.sh` (and/or have CI run `npm run validate`) so `contracts:check`, `compliance:check`, `production:gate`, `production-auth:check`, `production-worker:check`, `observability:check`, `security:check`, `ai:check`, `secrets:scan` run on every gate/CI. While there, fix `contracts-check.ts:226` inverted logic and strengthen `secrets-scan.ts` to cover provider/AWS/GitHub key shapes (or fold the CI inline grep into it). This restores the safety net that catches the rest.
2. **Enforce the compliance gate on every send path.** Make `dummy-provider`, `twilio-provider`, and the campaign `worker.ts` all call `evaluateMessagingHardGate` **with the recipient `contact` and resolved `quietHours`** before any send — and add a wired check that asserts it (the contract requires it; the dormant gate was supposed to catch its absence).
3. **Validate JWT issuer + audience.** Pass an issuer allowlist and expected audience to `verifyClerkToken`; never derive the JWKS URL from an unvalidated `iss`. Add a check that production auth cannot be enabled without these set.
4. **Implement real multi-tenant webhook routing.** Resolve the tenant from `payload.To` via `ProviderPhoneNumber`; stop calling `getOrCreateCurrentOrg()` (demo) inside webhooks; handle the no-session case without a 500. Fix the status `updateMany` to target a unique message and add status-monotonicity.
5. **Make `npm test` hermetic + honest the README.** Gate the 6 live-DB tests behind `RUN_DB_TESTS`/`describe.runIf` (or mock Prisma), and rewrite the README to the actual commands (`docker compose up -d`, `prisma migrate`, `tsx scripts/seed.ts`, `npm run worker`, real playwright invocation). A setup doc that doesn't work is worse than none.
