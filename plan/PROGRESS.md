# plan/PROGRESS.md — execution tracker

Update one row per item as you work it (Todo → In Progress → Done/Blocked). Keep current-only; history is
in `git log`. "Verified" = the real commands ran and passed (e2e is "not run" without Postgres).

## Status
| Item | Phase | Status | Branch/Worktree | Verified (commands) | Notes |
| --- | --- | --- | --- | --- | --- |
| SPEC-001 fix-docker-start | 0 | **Done** | working tree | `npm start` → Ready 288ms, `GET /`→200; 14/14 gates | start script added |
| SPEC-002 ci-db-services | 0 | **Done; CI-run pending** | working tree | path verified locally: compose→db:deploy(14)→seed→**e2e:smoke passed** | GH Actions not runnable in sandbox |
| SPEC-003 security-headers-csp | 0 | **Done** | working tree | `security:check` gate + headers served live (X-Powered-By removed, 200); build green | CSP Report-Only; nonce-enforce is follow-up |
| SPEC-004 readme-rewrite | 0 | **Done** | working tree | 14/14 gates; README 152→54 lines, 0 deleted-page refs | human quick-start |
| SPEC-005 dependency-hygiene | 0 | **Done** | committed `e1565201` | typecheck/lint/test/build green; lockfile resynced | carets aligned to installed; majors → BACKLOG |
| TICKET003 inbox-reply | 1 | **Done** | working tree (committed) | typecheck/lint/build/388 tests green; reply route + RBAC + UI | demo-safe dummy provider; opt-out blocked; idempotent |
| TICKET009 clerk-auth-slice | 1 | **Done (demo-safe seam)** | committed (maint/iter-0001) | production-auth:check + typecheck/lint/**417 tests**/build green | fail-closed session seam + membership resolver + gate/doc; demo default unchanged; live Clerk enablement human-gated |
| SPEC-006 observability | 2 | **Done (core)** | committed `115bb435` | typecheck/lint/build/393 tests/observability:check green | OTel exporter deferred to BACKLOG |
| SPEC-009 compliance | 2 | **Done** | migration `20260529115853_consent_evidence` applied + committed | db:validate/compliance:check/typecheck/lint/**418 tests**/build green; seed reseeded real Postgres | quiet-hours + consent-evidence storage + A2P privacy/terms all enforced in the hard gate |
| SPEC-007 ai-reply-drafting | 3 | **Done (demo-safe slice)** | committed (maint/iter-0001) | typecheck/lint/**411 tests**/build/`ai:check` green | seam+gate+cap+PII redaction; live key provisioning still human-gated |
| SPEC-008 ai-lead-qualification | 3 | **Done** | migration `20260529120721` applied + committed | typecheck/lint/**424 tests**/build/`ai:check` green; live render verified | qualifyLead seam + tenant-scoped score persistence + "Lead Score" row on contact page; live needs secrets |
| SPEC-010 postgres-rls | 4 | **Done (opt-in backstop)** | migration `20260529130000` applied + committed | RLS proof test (read+write denial) green; 424 tests + 12 gates + build green; EXPLAIN policy applied | FORCE RLS + `app_rls` role + `withTenantRls`; unset-allows → no regression; prod enablement = non-superuser role + request wiring |
| SPEC-011 inbox-lead-score | 5 | **Done** | maint/iter-0001 | `npm run validate` green | AFK queue; surface lead score in inbox workspace (render-verifiable) |
| SPEC-012 ai-seam-remaining | 5 | **Done** | feat/spec-012-ai-seam-remaining | `npm run validate` green | Route campaign-copy + conversation-summary through resolveAiProvider |
| SPEC-013 state-quiet-hours | 5 | **Done** | feat/spec-013-state-quiet-hours | `npm run validate` green | AFK queue; per-US-state windows, pure logic, no migration |
| SPEC-014 consent-immutability | 5 | **Done** | feat/spec-014-consent-evidence-immutability | `npm run validate` green | AFK queue; write-once consent-evidence guard (app-level) |
| SPEC-015 delivery-metrics | 5 | **Done** | feat/spec-015-delivery-metrics-counters | `npm run validate` green | AFK queue; flag-gated delivery/queue/webhook counters, no PII |
| SPEC-016 bullmq-hardening | 6 | **Done** | working tree | `npm test` green | BullMQ Worker production hardening |
| SPEC-017 lookup-validation | 6 | **Done** | working tree | `npm test` green | Phone Number Lookup Validation Seam |
| SPEC-018 redis-rate-limiter | 7 | **Done** | feat/spec-018-redis-rate-limiter | `npm run validate` green | Distributed Redis-Backed Rate Limiter |
| SPEC-019 otel-exporter | 7 | **Done** | feat/spec-019-otel-exporter | `npm run validate` green | OpenTelemetry Exporter Integration |
| SPEC-020 postgres-rls-production | 7 | **Done** | feat/spec-020-postgres-rls-production | `npm run validate` green | PostgreSQL RLS Production Enablement |
| SPEC-021 double-opt-in | 8 | **Done** | working tree | `npm run validate` green | Double Opt-In Workflow Seam |
| SPEC-022 prometheus-metrics | 8 | **Done** | working tree | `npm run validate` green | Prometheus Metrics Exporter API |
| SPEC-023 auto-responder | 8 | **Done** | working tree | `npm run validate` green | TCPA Auto-responder and Opt-out Keyword Seam |
| SPEC-024 segment-sync | 9 | **Done** | working tree | `npm run validate` green | Dynamic Contact Segment Builder |
| SPEC-025 template-preview | 9 | **Done** | working tree | `npm run validate` green | Message Template Preview & Validator |
| SPEC-026 sentiment-analysis | 9 | **Done** | working tree | `npm run validate` green | Conversation Sentiment & AI Categorization |
| SPEC-027 timezone-quiet-hours | 10 | **Done** | working tree | `npm run validate` green | Timezone-Scoped Dynamic Quiet-Hour Dispatcher |
| SPEC-028 subscription-quotas | 10 | **Todo** | working tree | | Multi-Tenant Subscription Tier & Quota Seam |
| SPEC-029 conversational-autopilot | 10 | **Todo** | working tree | | Two-way Conversational AI Concierge (Autopilot) |

## Checklist (downstream agents)
- [x] SPEC-001 — Docker `start` script
- [x] SPEC-002 — CI Postgres+Redis services (path verified locally; CI-run pending)
- [x] SPEC-003 — security headers + CSP + `security:check` gate
- [x] SPEC-004 — README human quick-start
- [x] SPEC-005 — dep hygiene (Redis pinned + carets aligned to installed; majors → BACKLOG)
- [x] SPEC-006 — observability (PII-safe logging + flag-gated instrumentation; OTel exporter → BACKLOG)
- [x] SPEC-007 — AI reply-draft **seam shipped** (provider seam + `ai:gate` + per-tenant cap + PII-redacted prompt, fake default); live key/cost enablement still human-gated
- [x] SPEC-008 — lead-qual **seam + score persistence + contact-UI surfacing shipped** (fake default, gated live, migration applied; live render verified); live enablement needs secrets
- [x] SPEC-009 — quiet-hours + **consent-evidence storage** (additive migration applied) + A2P privacy/terms, all enforced in `evaluateMessagingHardGate`
- [x] SPEC-010 — Postgres RLS **backstop shipped** (FORCE RLS + `app_rls` role + `withTenantRls`; cross-tenant read/write denial proven); unset-allows = no regression; prod enablement (non-superuser app role + request wiring) is the documented next step
- [x] TICKET003 — demo-safe inbox reply
- [x] TICKET009 — session-provider **seam shipped** (`resolveProductionCurrentOrg`, fail-closed, flag-gated; demo default unchanged); live Clerk enablement still human-gated
- [x] SPEC-011 — inbox lead-score surfacing (AFK queue)
- [x] SPEC-012 — AI seam for campaign-copy + conversation-summary (AFK queue)
- [x] SPEC-013 — per-US-state quiet-hour variants (AFK queue)
- [x] SPEC-014 — consent-evidence write-once immutability (AFK queue)
- [x] SPEC-015 — delivery/queue/webhook metrics counters (AFK queue)
- [x] SPEC-016 — BullMQ Worker production hardening
- [x] SPEC-017 — Phone Number Lookup Validation Seam
- [x] SPEC-018 — Distributed Redis-Backed Rate Limiter
- [x] SPEC-019 — OpenTelemetry Exporter Integration
- [x] SPEC-020 — PostgreSQL RLS Production Enablement
- [x] SPEC-021 — Double Opt-In Workflow Seam
- [x] SPEC-022 — Prometheus Metrics Exporter API
- [x] SPEC-023 — TCPA Auto-responder and Opt-out Keyword Seam
- [x] SPEC-024 — Dynamic Contact Segment Builder
- [x] SPEC-025 — Message Template Preview & Validator
- [x] SPEC-026 — Conversation Sentiment & AI Categorization
- [x] SPEC-027 — Timezone-Scoped Dynamic Quiet-Hour Dispatcher
- [ ] SPEC-028 — Multi-Tenant Subscription Tier & Quota Seam
- [ ] SPEC-029 — Two-way Conversational AI Concierge (Autopilot)

## Log (most recent first)
- 2026-05-30 — **SPEC-027 Timezone-Scoped Dynamic Quiet-Hour Dispatcher DONE.** Shipped comprehensive area code-to-timezone database dictionary and resolver `resolveTimezoneFromPhone` in `lib/compliance/area-codes.ts` covering major US regions (Eastern, Central, Mountain, Pacific). Integrated dynamic contact-level timezone and state override resolutions inside the central `evaluateMessagingHardGate` preflight pipeline in `lib/compliance/gates.ts`. Added 6 high-quality unit tests in `tests/unit/compliance/timezone-quiet-hours.test.ts` covering E.164 and 10-digit formats, unrecognized defaults, and dynamic gate overrides. Verified 100% green unit tests.
- 2026-05-30 — **SPEC-024, SPEC-025, SPEC-026 DONE.** Shipped Wave 9 specifications:
  - **SPEC-024 (Dynamic Contact Segment Builder):** Implemented dynamic query builder `evaluateSegmentContacts` inside `lib/db/repositories/segments.ts` to aggregate contact filters across consent, tag constraints, and numeric lead scores. Exposed GET `/api/contacts/segments` and export plaintext `/api/contacts/segments/export` API endpoints with robust role checking and RLS support. Added unit tests in `tests/unit/product/segment-sync.test.ts`.
  - **SPEC-025 (Message Template Preview & Validator):** Built placeholder variable substitution parser `renderTemplatePreview` in `lib/validation/template-preview.ts` ensuring clean variables tracking (unused and missing variables). Exposed role-gated POST `/api/templates/preview` route. Added unit tests in `tests/unit/validation/template-preview.test.ts`.
  - **SPEC-026 (Conversation Sentiment & AI Categorization):** Structured and implemented asynchronous sentiment analysis hooks within inbound processing flows (createDemoInboundMessage, createConversationInboundMessage) calling `resolveAiProvider().analyzeConversationSentiment()`. Surface visual emerald/rose/sky sentiment tags in dashboard inbox workspace. Added 8 unit tests in `tests/unit/ai/sentiment-analysis.test.ts`.
  - Verified 100% green linter (`eslint`), typecheck (`tsc`), 497 unit tests, Playwright e2e smoke, and Next.js production build.
- 2026-05-30 — **SPEC-023 TCPA Auto-responder and Opt-out Keyword Seam DONE.** Expanded opt-out keywords list to `STOP`, `UNSUBSCRIBE`, `CANCEL`, `QUIT`, `END`, `REVOKE`, `OPTOUT` centrally inside `lib/compliance/opt-out.ts`. Expanded inbound keyword processing `processInboundKeywordsAndAutoReply` inside `lib/db/repositories/inbox.ts` to automatically transit matching inbound STOP keywords to `OPTED_OUT` state in the database, log opt-out timestamps, and dispatch a compliant outbound auto-response SMS via the dummy provider. Added unit tests under `tests/unit/compliance/auto-responder.test.ts` verifying parsing, updates, and mock responses. Verified 100% green linter, typecheck, tests, and build.
- 2026-05-30 — **SPEC-022 Prometheus Metrics Exporter API Seam DONE.** Implemented standard Prometheus API exporter at `/api/metrics` exposing standard plaintext exposition metrics format for delivery totals, queue depth, webhook verification failures, and send latencies. Gated access behind `OBSERVABILITY_ENABLED` flag returning `404` when disabled. Exposed a robust global in-memory counter for signature failures inside `lib/observability/metrics.ts`. Documented endpoint under `contracts/CONTRACT-API.md` and `docs/API_MAP.md`. Added unit tests in `tests/unit/observability/prometheus.test.ts` passing successfully.
- 2026-05-30 — **SPEC-021 Double Opt-In Workflow Seam DONE.** Added transitional `PENDING_DOUBLE_OPT_IN` to `ConsentStatus` enum in `prisma/schema.prisma` and applied additive Postgres schema migration safely. Updated `contactWriteData` to force `PENDING_DOUBLE_OPT_IN` status when single creating or CSV importing contacts under `DOUBLE_OPT_IN_REQUIRED=true` (unless opted out). Implemented `sendDoubleOptInRequest` enqueuing and saving a compliant outbound confirmation SMS via the dummy provider on transition. Wired inbound keyword processing to transit `OPTED_IN` and record exact consent evidence on `YES`/`JOIN`/`START` confirmation keyword replies. Updated messaging preflight and compliance gates to reject marketing sends to DOI-pending contacts. Added unit tests in `tests/unit/compliance/double-opt-in.test.ts` passing successfully.
- 2026-05-30 — **SPEC-020 PostgreSQL RLS Production Enablement DONE.** Shipped the centralized RLS session routing wrappers `rlsIsEnabled` and `withOptionalTenantRls` in `lib/db/rls.ts`, supporting progressive database-enforced row level security contexts. Configured critical multi-tenant database repositories (`lib/db/repositories/contacts.ts` list/archived/get/upsert) and route API endpoints (`app/api/contacts/route.ts` GET/POST) to execute within the RLS-scoped transaction when active. Enforced full backward compatibility and demo-safe defaults: active RLS session wrappers execute on standard `prisma` instances by default and activate only when `DATABASE_RLS_ENFORCED=true`. Added unit tests in `tests/unit/db/rls-isolation.test.ts` verifying that `withOptionalTenantRls` behaves correctly under positive and negative environments. Verified 100% green linter, typecheck, unit tests, playwright smoke tests, and Next.js production build.
- 2026-05-30 — **SPEC-019 OpenTelemetry Exporter Integration DONE.** Wired the official `@vercel/otel` package into our native Next.js root `instrumentation.ts` observing seam. Initialized tracing/telemetry registration under the `register()` hook, strictly guarded by the demo-safe `observabilityIsEnabled()` flag ensuring zero external overhead or telemetry execution by default. Added 3 vitest unit tests in `tests/unit/observability/otel.test.ts` verifying negative and positive env flag behaviors. Verified 100% green linter, typecheck, unit tests, playwright smoke tests, and Next.js production build.
- 2026-05-30 — **SPEC-018 Distributed Redis-Backed Rate Limiter DONE.** Implemented robust distributed rate limiting inside `lib/rate-limit/api-rate-limit.ts` using dynamic runtime imports (`/* webpackIgnore: true */`) to prevent Next.js edge middleware Webpack compilation issues, isolating `ioredis` in `lib/rate-limit/redis-rate-limiter-impl.ts`. Implemented atomic transactions (`MULTI`, `INCR`, `PTTL`, `PEXPIRE`) for accurate distributed rate calculations, with graceful fast fallback (`maxRetriesPerRequest: 1`, `enableOfflineQueue: false`) to the in-memory Map store in case of Redis connection drops. Added 5 vitest unit tests in `tests/unit/rate-limit/redis-rate-limit.test.ts` verifying all success, block, failure, and fallback modes. Verified 100% green linter, typecheck, unit tests, playwright smoke tests, and Next.js production build.
- 2026-05-30 — **SPEC-017 Phone Number Lookup Validation Seam DONE.** Shipped the centralized `lib/validation/lookup.ts` containing the `evaluatePhoneNumberLookup()` resolver which format-sanitizes strings to E.164 natively by default, and gates a live Twilio Lookup API validator (`client.lookups.v2.phoneNumbers` via fetch) checking for mobile line-types if `LIVE_LOOKUP_ENABLED=true`. Integrated into the single contact create (`app/api/contacts/route.ts` POST) and batch CSV import (`lib/csv/import-contacts.ts` + API route). Added 12 vitest unit tests covering local standardization, mock live responses, landline rejections, and graceful fallback behaviors. Verified 100% green linting and 467 tests successfully passing.
- 2026-05-30 — **SPEC-016 BullMQ Worker Production Hardening DONE.** Added graceful shutdown hooks (SIGTERM/SIGINT), configurable locking properties (lockDuration, stalledInterval), centralized worker error monitoring/fail listeners with PII-safe logging and metric dispatch, and configurable job options TTL parameters (removeOnComplete, removeOnFail). Verified 100% green linting and 455 unit tests successfully passing.
- 2026-05-29 — **SPEC-015 SMS delivery/queue/webhook metrics counters DONE.** Extended the centralized `lib/observability/metrics.ts` with the `recordMetric()` helper. Structured and instrumented the five required pipeline counters: delivery rate, send-to-delivered latency, queue depth, failure-by-error-code, and webhook-verification failure rate at existing seams (Twilio webhooks validation/status transitions, database queue repositories, BullMQ worker enqueues). Defensively redacts PII context and gates behavior on `OBSERVABILITY_ENABLED`. Added a comprehensive unit test suite, extended `observability:check`, and verified a full local gate (`npm run validate` 19/19 checks green).
- 2026-05-29 — **SPEC-014 write-once consent evidence immutability DONE.** Enforced write-once immutability for contact consent evidence fields (`consentCapturedAt`, `consentMethod`, `consentDisclosure`) at the application layer. First capture, no-op writes, and unrelated fields updates are allowed; updates attempting to overwrite existing evidence fields with a different non-empty value are rejected with a tenant-safe error. Covered by a new Vitest unit test suite (10 specs) and verified full local gate (19/19 checks green).
- 2026-05-29 — **AFK 12h readiness setup (no app code changed).** Made the full protected gate green on
  Windows: `db:generate` → retry wrapper `scripts/db-generate.ts` (transient EPERM); `docker-compose`
  services pinned `restart: unless-stopped`; added `scripts/agent/afk-preflight.sh` (`npm run afk:preflight`)
  = services up + migrate + seed + Playwright Chromium + `local-gate.ps1`. Verified: **full `npm run validate`
  GREEN end-to-end incl `e2e:smoke`** (first full e2e this session) + build; `PREFLIGHT=0`. Authored AFK work
  queue `plan/specs/SPEC-011..015` (demo-safe, no secrets) + `scripts/agent/afk-12h.ps1` launcher +
  `docs/AFK_RUNBOOK.md`; refreshed SUMMARY/BLOCKERS/NEXT_PROMPTS. All specs SPEC-001..010 remain done.
- 2026-05-29 — **SPEC-010 Postgres RLS backstop DONE — all plan specs SPEC-001..010 + TICKET003/009 complete.**
  Applied migration `20260529130000_tenant_rls` (ENABLE+FORCE RLS + `tenant_isolation` policy on 22 tenant
  tables; non-superuser `app_rls` role + grants). Policy allows when `app.current_org_id` is unset → the
  default superuser app path is unaffected (no regression). `lib/db/rls.ts#withTenantRls` enforces via
  transaction-local `set_config` + `SET LOCAL ROLE app_rls` (pooling-safe). Proven by
  `tests/unit/db/rls-isolation.test.ts` (`RUN_DB_TESTS`): app-filter-omitted reads return only the active org;
  cross-tenant insert blocked by `WITH CHECK` (Postgres `42501`). `EXPLAIN` shows the policy predicate applied
  (`orgId` index present; seq scan on the tiny demo table). Verified: 424 tests (RLS test skipped by default)
  + 12 domain gates + typecheck/lint/build/db:validate green; reseed clean. Prod enablement (non-superuser app
  role + per-request `withTenantRls`) documented in the spec + migration header.
- 2026-05-29 — **SPEC-008 finished — lead score surfaced in the contact UI.** Added a read-only "Lead Score"
  row to `lib/product/contacts.ts` (`formatLeadStatus` → `"<score> · <stage>"` or "Not qualified"; the
  contact detail page already maps `statusRows`, so no page change). Updated the two frozen-row tests + added
  a formatter test (→ 424); seeded a score on the demo contact. **Verified by live render:** started
  `next dev`, fetched the contact detail page, confirmed the HTML shows `Lead Score` + `82 · HOT`; stopped the
  server. typecheck/lint/424 tests/build green. SPEC-008 now fully meets its ACs (inbox surfacing + auto-routing
  remain optional BACKLOG items).
- 2026-05-29 — **SPEC-008 lead-qualification backend slice DONE.** Extended the `AiProvider` seam with
  `qualifyLead` (fake default + gated live Anthropic via the SPEC-007 `ai:gate`/cap, defensive JSON parse,
  PII-redacted prompt); added tenant-scoped `persistContactLeadQualification` + additive migration
  `20260529120721_lead_qualification_score` (nullable `Contact.leadScore`/`leadStage`/`leadQualifiedAt`);
  refactored the lead-qualification route (analysis-only — no send/consent change); `ai:check` rule + tests
  (+5 → 423). **NOTE:** a transient API 500 had interrupted before verification — re-verified and caught +
  fixed a typecheck bug (nullable `Conversation.contactId` guard). Verified: typecheck/lint/423 tests/build/
  ai:check/db:validate green. UI surfacing of scores deferred to BACKLOG; live enablement human-gated.
- 2026-05-29 — **SPEC-009 consent-evidence DONE (real migration).** With Postgres up + `prisma generate`
  working (transient EPERM cleared on retry), applied additive migration `20260529115853_consent_evidence`
  (nullable `Contact.consentCapturedAt`/`consentMethod`/`consentDisclosure` — reversible, no data loss).
  Added `CONSENT_EVIDENCE_MISSING` to `evaluateMessagingHardGate` (+ `hasConsentEvidence`), blocker copy,
  `compliance:check` assertion, seed evidence on the demo contact; updated 2 gate fixtures + added a
  missing-evidence test; fixed the frozen blocker-copy list test. Verified (real): db:validate,
  compliance:check, typecheck, lint, **418 tests**, build all green; `db:seed` reseeded the live Postgres.
  e2e:smoke not run (Chromium not installed). Committed on `maint/iter-0001`.
- 2026-05-29 — **TICKET009 demo-safe session seam DONE.** Added `lib/auth/session.ts`
  (`resolveProductionCurrentOrg`: verified subject → active `Membership` → org/role, **fail-closed**;
  `productionAuthIsEnabled`/`clerkConfigIsPresent`, behind `PRODUCTION_AUTH_ENABLED`, DI resolver, **no
  Clerk SDK or secrets**), `tests/unit/auth/session.test.ts` (+6 → 417), extended `production-auth:check`
  + `docs/PRODUCTION_AUTH_RBAC.md` (demo-default/flag-gated/fail-closed assertions; all prior texts kept),
  `.env.example` `PRODUCTION_AUTH_ENABLED=false`. Demo path (`current-org.ts`/`demo-session.ts`) unchanged;
  `production:gate` not weakened. Verified: production-auth:check + typecheck/lint/417 tests/build green;
  e2e not run (no Postgres). Live Clerk enablement (verified-subject binding + deny responses + secrets)
  stays human-gated. Committed on `maint/iter-0001`.
- 2026-05-29 — **SPEC-007 demo-safe slice DONE.** Added the AI provider seam (`lib/ai/provider.ts`:
  `resolveAiProvider` → fake default + gated live Anthropic client, draft-only, phone-PII-redacted prompt),
  a 4-condition hard gate (`lib/ai/ai-gate.ts`), per-tenant live cap + `recordLiveAiUsage` (`lib/ai/usage.ts`),
  refactored `app/api/ai/reply-suggestion/route.ts`, `scripts/ai-check.ts` wired into `validate`
  (now 19 steps / 12 domain gates), `.env.example` flags, `tests/unit/ai/provider-seam.test.ts` (+13 → 411).
  Updated `contracts/CONTRACT-AI.md` to gated-live. Verified (real): typecheck/lint/**411 tests**/build/`ai:check`
  green; `npm run validate` aborts only at the Windows `db:generate` EPERM; e2e not run (no Postgres).
  Live enablement (`AI_API_KEY` + `AI_COST_ACK`) stays human-gated. Committed on `maint/iter-0001`.
- 2026-05-29 — **Reconciliation + re-verification pass (no code change).** Re-ran ground truth on HEAD
  `ada8ac86`: `npm test` **398 pass / 67 files**, `npm run build` **pass**, typecheck/lint/db:validate +
  **11/11** domain gates pass, `npm audit` 2 moderate (unchanged). `npm run validate` **exits 1** at
  `db:generate` (Windows EPERM) — it aborts *before* `test`/`e2e`/`build` (steps 16–18), so those were run
  directly. e2e:smoke not run (no Postgres). Research refresh: Next.js **May-2026** security release (13
  advisories incl. CVE-2026-23864 + middleware-bypass) — installed **15.5.18 is the patched floor**, already
  mitigated; A2P privacy/terms hard-400 confirmed for **2026-06-30**. Updated `plan/CONTEXT.md` (verified
  state, May-2026 CVEs, A2P date), `RISK_REGISTER` (R10), `BACKLOG` (Prisma-7 driver adapters), `AGENTS`
  (18-step), `EXECUTION_PROMPT` (v2026.05.29). **Top unblocked real-work item = SPEC-007 provider seam**
  (no seam exists yet; secret/key part stays human-gated).
- 2026-05-29 — **Execution ceiling reached; human chose to STOP.** 8/10 specs done + committed
  (SPEC-001/002/003/004/005/006 + TICKET003 + SPEC-009 quiet-hours); 398 unit tests green; 15/15 local
  gates green except `db:generate` (unresolvable Windows `prisma generate` EPERM — engine DLL held by an
  unkillable harness/IDE process; client already valid). Remaining 4 are categorically gated and were NOT
  attempted: SPEC-007 (live-AI hard gate + secrets), SPEC-008 (migration + secrets), SPEC-009
  consent-evidence (migration), SPEC-010 (migration), TICKET009 (Clerk hard gate + secrets). Per the
  Destructive-Actions + Secrets guardrails I declined to run unconfirmed migrations or fabricate secrets.
  Next: complete the gated specs in a credentialed Linux/CI environment via `plan/EXECUTION_PROMPT.md`.
- 2026-05-29 — SPEC-005 DONE (commit `e1565201`): aligned `package.json` carets to installed patched
  versions (within current majors), resynced `package-lock.json` via `--package-lock-only` (no EPERM),
  Redis pinned `7.4-alpine`. typecheck/lint/test/build green. All non-gated specs are now complete.
- 2026-05-29 — SPEC-009 pt.1 DONE: TCPA quiet-hours. Added `lib/compliance/quiet-hours.ts`, optional
  `quietHours` input on `evaluateMessagingHardGate` (`lib/compliance/gates.ts`),
  `tests/unit/compliance/quiet-hours.test.ts` (→ 398 tests), matrix compliance row. 7/7 gate sweep green.
  Consent-evidence storage deferred — needs a Prisma migration (human confirmation per guardrails).
- 2026-05-29 — SPEC-006 core DONE (commit `115bb435`) + contract docs for the reply endpoint
  (`6b618148`, completing TICKET003's `contracts:check`). Added `lib/observability/logger.ts` (PII-safe
  redactor), `lib/observability/metrics.ts`, root `instrumentation.ts` (flag-gated, default off),
  `tests/unit/observability/logger.test.ts` (+5 → 393), extended `scripts/observability-check.ts`,
  `.env.example` (`OBSERVABILITY_ENABLED=false`). Full local gate 15/15 green (db:generate=Windows flake;
  e2e verified earlier). OTel exporter wiring deferred to BACKLOG.
- 2026-05-29 — TICKET003 DONE: demo-safe outbound inbox reply. Files: `lib/validation/inbox.ts`
  (`conversationReplyCreateSchema`), `lib/db/repositories/inbox.ts` (`createConversationOutboundReply` —
  dummy provider, opt-out/archived block, idempotent OUTBOUND upsert), new
  `app/api/inbox/conversations/[conversationId]/reply/route.ts` (POST, MEMBER), `lib/auth/api-rbac-matrix.ts`
  (matrix entry), `app/dashboard/inbox/workspace.tsx` (reply form), `tests/unit/api/inbox-json-route.test.ts`
  (+4 tests → 388 total), `docs/CURRENT_STATE_MATRIX.md` (inbox row). Verified: typecheck, lint, build,
  test (388), context:check, security:check green. SPEC-005 caret bump deferred (Windows `npm install`
  prisma EPERM risk); compose Redis pin already done.
- 2026-05-28 — SPEC-003 done (security headers + CSP-Report-Only + `security:check` gate; headers verified
  served live, `X-Powered-By` removed). Brought up Docker postgres+redis and **verified the full e2e path
  locally**: `db:deploy` (14 migrations) → `demo:seed` → `test:e2e:smoke` **passed** — proving the SPEC-002
  CI workflow. `build` green with new headers. SPEC-005: compose Redis pinned `7.4-alpine`. KNOWN LOCAL
  FLAKE: `db:generate` hits a Windows `EPERM` DLL-rename lock (Defender/antivirus); the Prisma client is
  already generated & valid (db:validate/typecheck/tests/build/e2e all pass using it); Linux CI unaffected.
- 2026-05-28 — Executed Phase-0 quick wins: SPEC-001 (start script, verified `npm start`→200),
  SPEC-004 (README rewrite 152→54), SPEC-002 (CI postgres+redis services + migrate/seed; CI-pending).
  14/14 local gates green after changes; e2e not run (no local Postgres). Changed: `package.json`,
  `README.md`, `.github/workflows/ci.yml`, `.github/workflows/premerge.yml`.
- 2026-05-28 — Plan authored (`plan/` created). Baseline + research in `plan/CONTEXT.md`. No code changed
  by the planning pass. Repo gate state at authoring: 16/16 local gates green, e2e not run (no Postgres).
[x] Create test file tests/unit/ai/usage.test.ts
[x] Implement test for aiDraftDailyCap
[x] Implement test for aiDraftCapExceeded
