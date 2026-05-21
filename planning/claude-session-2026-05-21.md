<!--
Session: Claude Code — 2026-05-21
Author: Claude Code (Opus 4.7) in-session planning
Status: This is the implementation plan DRAFTED IN-SESSION. It was handed off to
        Ultraplan for remote refinement (Claude Code on the web,
        session_011ig2WqueE7ZqFwrkg4GXct), which was approved and is executing;
        results will land as a pull request. The refined Ultraplan output is NOT
        reproduced here — this file is the pre-refinement draft (the input to Ultraplan).
        Treat the PR as the source of truth for the final, refined plan.
-->

# SignalStack SMS — Implementation Plan to Production Completion

## Context

SignalStack SMS is a 100% AI-coded, multi-tenant SMB SMS/MMS SaaS (Next.js 15, React 19, Prisma/Postgres, BullMQ/Redis, Zod). The repo has **strong backend foundations** (Milestones 0–10 in `PLAN.md`): a clean tenant-scoped data model, repositories, API routes for contacts/campaigns/inbox/compliance/AI/billing, a provider abstraction, validated Twilio webhooks, a BullMQ scaffold, a fake AI provider, local usage metering, and an investor demo path.

But it is **demo-complete, not product-complete**. Three structural gaps stand between the current state and a finished, production, revenue-generating product:

1. **Nothing live is real.** Auth is a hardcoded single demo user (`lib/auth/demo-session.ts`); SMS uses `dummyProvider`; AI is a deterministic fake; billing records locally and never calls Stripe. Every live path is intentionally gated off (`DEMO_MODE`, `LIVE_MESSAGING_ENABLED`, `MESSAGING_PROVIDER=dummy`, `AI_PROVIDER=fake`).
2. **There is no functional product UI.** `app/` contains only API routes, an investor `/demo` console, and ~30 *read-only* "operations review" pages under `app/settings/*`. There is no screen where a user actually creates a contact, builds/sends a campaign, or works the shared inbox.
3. **The AI build loop accumulated heavy scaffolding debt.** `PLAN.md`'s "Post-MVP" section is ~200 tasks that are almost entirely read-only review pages and meta-tests (e.g. "whitespace-clean coverage", "detached status-array count coverage", "secret-literal coverage"). The test suite is ~70% static-metadata assertions; `codex-runs/` (50 files), `LOOP_LOG.md`, and root `SUMMARY.*`/`BLOCKERS.*` are committed agent transcripts.

**Intended outcome of this plan:** take SignalStack from "demo-safe foundations" to a deployable, live, multi-tenant SaaS — real authentication + RBAC, a real operator UI, live Twilio sending with delivery tracking and A2P compliance, live (gated) AI, Stripe billing, production infrastructure (secrets, distributed rate limiting, observability), a rebalanced test suite, and a documented go-live cutover — **without weakening the existing hard-gate safety model** that prevents accidental live sends.

This plan preserves the project's best idea (the layered live-cutover gate) and reuses existing utilities wherever possible rather than rewriting.

---

## Current-State Assessment (verified against code)

**Solid and reusable:**
- Tenant isolation via `orgWhere()` (`lib/db/tenant.ts`) applied consistently across `lib/db/repositories/*`.
- Central messaging gate `evaluateMessagingHardGate()` (`lib/compliance/gates.ts:32`) — every live send must pass through it.
- Provider abstraction: one-method `MessagingProvider` interface (`lib/messaging/provider/types.ts`), with `dummyProvider` as the demo impl.
- Twilio webhook signature validation is correct (HMAC-SHA1 + `timingSafeEqual`, `lib/messaging/twilio-webhooks.ts:34`).
- Preflight consent logic `preflightCampaignRecipients()` (`lib/messaging/send-preflight.ts:18`) already exists.
- RBAC helpers `assertRoleAtLeast()` / `hasRoleAtLeast()` (`lib/auth/roles.ts`).
- Zod validation across all API inputs (`lib/validation/*`).
- Production env gate `evaluateProductionDeploymentGate()` (`lib/deployment/production-gate.ts`).

**Faked / gated (must be made real):**
- Auth: `getDemoSession()` returns one fixed OWNER for every request (`lib/auth/demo-session.ts:14`). Clerk is in the data model (`clerkUserId`/`clerkOrgId`) but **not integrated**.
- Messaging: only `dummyProvider`; no Twilio adapter.
- AI: `fake-ai-provider.ts` only; `assertFakeAiProvider()` throws if a live provider is selected.
- Billing: `lib/billing/metering.ts` records `UsageEvent` rows locally; no Stripe calls.

**Confirmed defects / gaps (independent of demo-mode intent):**
- **RBAC defined but never enforced.** Only `app/api/orgs/current` references role; mutating routes (e.g. `app/api/campaigns/[campaignId]/route.ts` `PATCH`) do no role check.
- **Worker skips send-time consent recheck.** `processScheduledCampaignQueueJob()` (`lib/queue/worker.ts:197`) iterates `campaign.recipients` and sends to all of them; it never calls `preflightCampaignRecipients()`. A contact who opts out after scheduling still gets messaged on the live path.
- **Rate limiting is in-memory only** (`lib/rate-limit/api-rate-limit.ts` uses a module-level `Map`) — not shared across instances; bypassable when horizontally scaled.
- **Idempotency keys are globally `@unique`** (`prisma/schema.prisma` lines 346/372/530), not `@@unique([orgId, idempotencyKey])`.
- **Provider/AI/billing credentials** stored as redacted metadata only; no secret-manager integration.
- **No structured logging, metrics, error tracking, or alerting.**
- **RBAC role set mismatch:** code has 3 roles (MEMBER/ADMIN/OWNER, `lib/auth/roles.ts`); canonical plan envisions 5 (OWNER/ADMIN/MANAGER/AGENT/VIEWER).

**Scaffolding debt:**
- ~30 near-duplicate read-only pages under `app/settings/*` sharing ~3k lines of boilerplate.
- Test suite ~70% static-metadata assertions (esp. `tests/unit/operations/operator-surfaces.test.ts`, ~2,371 lines).
- Committed agent artifacts: `codex-runs/` (~4.6k lines), `LOOP_LOG.md`, root `SUMMARY.*.md` / `BLOCKERS.*.md`, `PLAN.md` noise.

---

## Target End State (Definition of Done)

A multi-tenant SaaS that an SMB can sign up for, configure, and use to run compliant SMS campaigns:

1. **Auth & tenancy:** Clerk-backed sign-up/sign-in; users belong to orgs with enforced roles; org switching; invitations.
2. **Operator UI:** functional, mutating screens for Contacts, Campaigns (composer + scheduling + preflight), Shared Inbox (two-way threads, assignment, notes, resolve), Templates, Compliance, Provider/Numbers, Billing, Settings.
3. **Live messaging:** real Twilio adapter (send, status, inbound, MMS, error/retry handling), delivery tracking, A2P 10DLC registration flow, send-time compliance enforcement, quiet hours.
4. **Live AI (gated):** Anthropic Claude provider behind `AI_PROVIDER`/`AI_LIVE_ENABLED`, with prompt caching and per-org cost controls.
5. **Billing:** Stripe customers/subscriptions, usage-based metering wired from `UsageEvent`, Stripe webhooks, dunning.
6. **Production infra:** secret manager, Redis-backed distributed rate limiting, structured logging + metrics + error tracking + alerting, deploy pipeline for web + worker + redis + postgres.
7. **Quality:** test suite rebalanced toward behavior; meaningful E2E across real flows; scaffolding trimmed.
8. **Operability:** go-live runbook, break-glass disable, staged rollout, on-call signals.

The existing **hard-gate model is retained**: demo stays the default; live is reachable only by satisfying env flags + org flags + compliance + production gate.

**Assumed stack decisions** (defaults; flag if you want different): Auth = **Clerk**; SMS = **Twilio (A2P 10DLC)**; AI = **Anthropic Claude** (`claude-sonnet-4-6` default, with prompt caching); Billing = **Stripe**; DB = **Postgres**; Queue = **BullMQ/Redis**; deploy = containerized web + worker + managed Postgres + managed Redis.

---

## Guiding Principles

- **Contracts-first** (as the repo already does): update `contracts/CONTRACT-*.md` before/with each feature; `npm run contracts:check` must stay green.
- **Never weaken the hard gate.** All live external impact continues to route through `evaluateMessagingHardGate()` and the production gate. Demo remains default.
- **Reuse before rewrite.** Implement the `MessagingProvider` interface, call `preflightCampaignRecipients()`, enforce `assertRoleAtLeast()` — don't reinvent.
- **Keep demo path green throughout.** `npm run validate` and the Playwright demo path (`e2e/demo-path.spec.ts`) must pass after every phase.
- **Pay down scaffolding as you build**, not in a separate someday-bucket.

---

## Phased Plan

> Phases 1–7 are the build. Phase 0 is concurrent cleanup. Several phases parallelize (see Sequencing). Each phase ends green on `npm run validate`.

### Phase 0 — Stabilize, de-scaffold, fix latent defects (foundational, concurrent)

**Goal:** establish a trustworthy baseline and stop the scaffolding bleed before adding real systems.

**Tasks:**
- **Repo hygiene:** add to `.gitignore` and remove from tracking: `codex-runs/`, `LOOP_LOG.md`, root `SUMMARY.*.md`, `BLOCKERS.*.md`, `docs/loop-artifacts/`. Move `PLAN.md` "Post-MVP" busywork list into an archived note; replace with this plan's milestones. Keep `docs/` reference material.
- **Fix idempotency uniqueness:** migrate `idempotencyKey @unique` → `@@unique([orgId, idempotencyKey])` on `QueueJob`, `Message`, `WebhookEvent` (`prisma/schema.prisma`); add migration; update repository lookups (`lib/db/repositories/webhooks.ts`, worker upserts).
- **Enforce RBAC in mutating routes:** add `assertRoleAtLeast(currentOrg.role, ...)` to all `POST/PATCH/DELETE` routes under `app/api/**` (campaigns, contacts, inbox, settings/provider, templates, compliance). Return `403` on failure. Expand role set to OWNER/ADMIN/MANAGER/AGENT/VIEWER in `lib/auth/roles.ts` + schema enum (align with canonical plan).
- **Consolidate read-only settings pages:** extract a shared `OperationsReviewLayout` component (header + projected nav + section grid) and drive the ~30 `app/settings/*/page.tsx` from a data config; delete duplicated boilerplate. Keep genuinely useful ones (system status, health, readiness-audit); fold redundant ones.
- **Rebalance tests:** quarantine pure static-metadata assertions (frozen/whitespace/field-order) into a small `tests/contract/` suite; keep behavior tests in `tests/unit`. Net target: behavior tests become the majority of assertions. Do **not** delete the genuinely valuable ones (`tests/unit/compliance/hard-gates.test.ts`, `billing/metering`, `messaging/*`, `validation/*`).

**Files:** `.gitignore`, `prisma/schema.prisma` (+new migration), `lib/auth/roles.ts`, `app/api/**/route.ts`, new `components/operations/operations-review-layout.tsx`, `app/settings/*/page.tsx`, `tests/**`.

**Verification:** `npm run validate` green; RBAC unit tests prove a VIEWER/MEMBER is rejected from a mutating route; migration applies cleanly; demo path still passes.

---

### Phase 1 — Real authentication & RBAC (Clerk)

**Goal:** replace the hardcoded demo session with real multi-user, multi-org auth, while preserving a deterministic demo identity for `DEMO_MODE`.

**Tasks:**
- Add `@clerk/nextjs`; wrap `app/layout.tsx` in `<ClerkProvider>`; add `clerkMiddleware()` to `middleware.ts` (compose with the existing rate-limit logic — do not drop it).
- Replace `getDemoSession()` usage: `getOrCreateCurrentOrg()` (`lib/auth/current-org.ts`) becomes `auth()`-driven — resolve Clerk user → upsert `AppUser` by `clerkUserId` → resolve active org membership → return `CurrentOrg`. **Keep a `DEMO_MODE` short-circuit** that returns the seeded demo identity so the investor demo and CI stay deterministic.
- Org model: org creation on first sign-in, **invitations** (email → `Membership` with role + `PENDING/ACTIVE`), org switcher, membership management UI.
- Wire Clerk Organizations to `clerkOrgId` on `Organization`; sync role changes.
- Sign-in/sign-up/onboarding routes (`app/(auth)/sign-in`, `sign-up`, `app/onboarding`).
- Replace any client-trusted org identifiers; org is always derived server-side from the authenticated session.

**Reuse:** `CurrentOrg` type, the upsert structure in `lib/auth/current-org.ts`, `assertRoleAtLeast`.

**Files:** `middleware.ts`, `app/layout.tsx`, `lib/auth/current-org.ts`, new `lib/auth/clerk.ts`, `app/(auth)/**`, `app/onboarding/**`, settings team UI, `prisma/schema.prisma` (membership invite fields).

**Verification:** two real users in two orgs cannot see each other's data (integration test); demo mode still yields the seeded owner; RBAC enforced end-to-end; `production:gate` unaffected.

---

### Phase 2 — Functional operator UI

**Goal:** build the actual product — mutating screens backed by existing APIs — since today only read-only review pages exist.

**Tasks (each is a real, mutating UI surface):**
- **App shell:** authenticated layout with org switcher + primary nav (reuse `components/layout/*`). Distinguish product nav from the `/settings/*` review surfaces.
- **Contacts:** list (filter by consent/tag/list/segment), create/edit, consent management, CSV import wizard (backed by `app/api/contacts/imports` + `lib/csv/*`), tag/list/segment management.
- **Campaigns:** list + composer (template variables via `lib/messaging/render-template.ts`), audience selection, **preflight panel** showing `preflightCampaignRecipients()` results, schedule/cancel (backed by existing campaign routes), status tracking.
- **Templates:** CRUD UI over `app/api/templates`.
- **Shared inbox:** conversation list, two-way thread view, send reply (gated), assign to member, internal notes, resolve/reopen — backed by `app/api/inbox/**`. Live updates (polling or SSE).
- **Compliance:** profile form + A2P checklist (`app/api/settings/compliance`), go-live readiness indicators.
- **Provider & numbers:** credential form (already partially present in `app/settings/provider/provider-credential-form.tsx`), number management.
- **Analytics:** dashboard from `app/api/analytics/overview` + `lib/analytics/overview.ts` (charts).
- **Billing:** plan/usage UI from `app/api/billing/usage`.

**Reuse:** all existing `app/api/**` routes (the backend is largely built), `lib/messaging/render-template.ts`, `preflightCampaignRecipients`, `lib/analytics/overview.ts`, `components.json`/Tailwind setup.

**Files:** new `app/(app)/contacts`, `campaigns`, `inbox`, `templates`, `analytics` route groups; shared UI components under `components/`.

**Verification:** Playwright flows for create-contact → build-campaign → preflight → schedule, and inbound message → inbox reply → resolve; demo path extended to exercise UI; a11y/loading/error states present.

---

### Phase 3 — Live Twilio provider adapter

**Goal:** make SMS real while keeping every send behind `evaluateMessagingHardGate()`.

**Tasks:**
- Implement `twilioProvider: MessagingProvider` (`lib/messaging/provider/twilio-provider.ts`) implementing `send()`; integrate the official `twilio` SDK; pull credentials from the secret manager (Phase 7), not raw DB fields.
- **Extend the provider contract** (`lib/messaging/provider/types.ts`): enrich `MessageSendResult` (real provider status, error code) and add status/inbound normalization hooks so live status/error codes flow into `Message.providerStatus`/`providerErrorCode`.
- **Provider selection:** a factory `getMessagingProvider(env)` returning dummy vs twilio based on `MESSAGING_PROVIDER`; the worker (`lib/queue/worker.ts`) and any send entrypoint use it instead of importing `dummyProvider` directly.
- **Gate every send:** call `evaluateMessagingHardGate()` (with org/compliance/contact inputs) before any Twilio call; on block, record the reason — never call the provider.
- **Webhooks → live:** `app/api/webhooks/twilio/status` and `/inbound` already validate signature and normalize; wire status transitions to update `Message` rows and inbound to create inbox messages + STOP/HELP consent effects (paths exist; flip from demo to live and add per-number → org routing so production webhooks map to the right tenant).
- **MMS** media handling; **retry/backoff** on Twilio 429/5xx via BullMQ retry; **rate/throughput limiting** aligned to Twilio MPS and queue backpressure.
- **A2P number provisioning**: verify number ownership before marking `ProviderPhoneNumber.provider=twilio`.

**Reuse:** `MessagingProvider` interface, `validateTwilioSignature`/`normalizeTwilioInbound`/`normalizeTwilioStatus` (`lib/messaging/twilio-webhooks.ts`), `evaluateMessagingHardGate`, BullMQ worker (`lib/queue/bullmq-worker.ts`).

**Files:** new `lib/messaging/provider/twilio-provider.ts`, `lib/messaging/provider/factory.ts`; `lib/messaging/provider/types.ts`; `lib/queue/worker.ts` + `bullmq-worker.ts`; webhook routes; `prisma/schema.prisma` (number→org routing).

**Verification:** unit tests with a mocked Twilio client (success, 429 retry, error code capture); signature-rejection test stays green; an integration test proving a blocked gate never calls the provider; staging send to an allowlisted test number (`ALLOWLISTED_TEST_NUMBERS`).

---

### Phase 4 — Compliance hardening (A2P, send-time enforcement, quiet hours)

**Goal:** make compliance enforceable in production, not just metadata.

**Tasks:**
- **Send-time consent recheck (defect fix):** in `processScheduledCampaignQueueJob()` (`lib/queue/worker.ts:197`), call `preflightCampaignRecipients()` against freshly-loaded contacts and **skip blocked recipients** (don't send to anyone opted-out since scheduling). Record skips.
- **Quiet hours / timezone-aware suppression:** per-org quiet-hours config; defer or skip sends outside allowed windows.
- **A2P 10DLC registration flow:** UI + API to submit Brand/Campaign to Twilio; store Brand SID/Campaign SID; webhook/poll to flip `a2pRegistrationStatus` → `APPROVED`; gate already checks `A2pRegistrationStatus.APPROVED`.
- **STOP/HELP** confirmation copy (configurable) and HELP auto-response (gated through the same live path).
- **Audit:** ensure every consent transition and config change writes `LiveReadinessAuditEvent`/consent events (extend existing readiness-audit).
- **Message frequency caps** per contact/org.

**Reuse:** `preflightCampaignRecipients`, `evaluateMessagingHardGate`, `complianceProfileIsComplete`, existing readiness-audit repository.

**Files:** `lib/queue/worker.ts`, new `lib/compliance/quiet-hours.ts`, `lib/compliance/a2p.ts`, compliance API + UI, `prisma/schema.prisma` (quiet hours, A2P SIDs, frequency caps).

**Verification:** test proving opted-out-after-scheduling contacts are skipped at send; quiet-hours suppression test; A2P-not-approved blocks live send; HELP/STOP tests stay green.

---

### Phase 5 — Live AI provider (Anthropic Claude, gated)

**Goal:** real AI for campaign copy, reply suggestions, summaries, lead qualification — opt-in and cost-controlled.

**Tasks:**
- Add `AI_LIVE_ENABLED` gate alongside `AI_PROVIDER`; implement `claudeProvider` mirroring the `fake-ai-provider` function surface; factory selects fake vs live; `assertFakeAiProvider()` generalizes to `assertAiProviderAllowed()`.
- Use the Anthropic SDK with **prompt caching** (per the claude-api skill) on the shared system prompt; default `claude-sonnet-4-6`.
- **Cost controls:** per-org token budgets/rate limits; record `AI_REQUEST` usage events (already modeled) for billing; redact PII from prompts/logs.
- Keep fake provider as the default and the CI/demo path.

**Reuse:** `lib/ai/fake-ai-provider.ts` surface, `lib/ai/conversation-context.ts` (tenant-scoped context), `app/api/ai/*` routes, usage metering.

**Files:** new `lib/ai/claude-provider.ts`, `lib/ai/factory.ts`; `lib/ai/fake-ai-provider.ts` (rename assertion); `app/api/ai/*`.

**Verification:** unit test that live calls are blocked unless `AI_LIVE_ENABLED=true`; mocked-SDK tests for each endpoint; cache-hit assertion; usage events recorded.

---

### Phase 6 — Stripe billing

**Goal:** turn local usage metering into real subscription + usage billing, gated by `LIVE_BILLING_ENABLED`.

**Tasks:**
- Stripe customer creation from org; subscription on plan selection; **usage-based metering**: report `UsageEvent` aggregates to Stripe; invoices/portal link.
- **Stripe webhooks** (`app/api/webhooks/stripe`) for payment success/failure, subscription lifecycle, dunning; signature verification.
- **Billing hard gate:** mirror the messaging gate — no Stripe mutation unless `LIVE_BILLING_ENABLED=true` and not demo/CI; test proves it.
- Plan/quota enforcement (e.g. monthly message caps) feeding back into the send gate.

**Reuse:** `lib/billing/metering.ts` (usage aggregation already exists), `getOrCreateBillingAccount`, production gate.

**Files:** new `lib/billing/stripe.ts`, `app/api/webhooks/stripe/route.ts`, billing UI; `prisma/schema.prisma` (Stripe IDs, subscription state).

**Verification:** test proving Stripe is never called in demo/CI; mocked-Stripe subscription + usage-report tests; webhook signature test; metering → invoice reconciliation test.

---

### Phase 7 — Production infrastructure (cross-cutting)

**Goal:** the operational substrate required to run live safely.

**Tasks:**
- **Secret management:** move Twilio/Stripe/Clerk/Anthropic secrets to a secret manager (or platform secret store); credential repositories keep redacted metadata only (as today). Document rotation.
- **Distributed rate limiting:** replace the in-memory `Map` in `lib/rate-limit/api-rate-limit.ts` with a Redis-backed limiter (reuse the BullMQ Redis connection in `lib/queue/redis.ts`); keep the existing header/policy interface.
- **Observability:** structured JSON logging (request id, org id, route, status, latency — **no secrets/PII/message bodies** per `docs/PRODUCTION_OBSERVABILITY.md`); metrics for the signals that doc enumerates (queue status, 4xx/5xx, 429s, webhook signature rejections, STOP/HELP counts, AI/usage counts); error tracking (Sentry); uptime/health alerting on `/api/health`.
- **Deployment topology:** containerized web + separate worker process (`workers/index.ts` / `workers/bullmq.ts`) + managed Postgres + managed Redis; CI/CD to staging then prod; run `prisma migrate deploy` + `production:gate` in the pipeline; blue-green/canary with feature flags.
- **Break-glass:** documented one-switch disable of live sends (`LIVE_MESSAGING_ENABLED=false`) and a runbook.

**Reuse:** `lib/rate-limit/api-rate-limit.ts` interface, `lib/queue/redis.ts`, `Dockerfile`/`docker-compose.yml`, `scripts/production-gate.ts`, `lib/deployment/production-gate.ts`, `docs/PRODUCTION_*` docs.

**Files:** `lib/rate-limit/api-rate-limit.ts`, new `lib/observability/*`, `Dockerfile`/compose, `.github/workflows/*`, secret config.

**Verification:** rate-limit shared across instances (integration test against Redis); logs contain no secrets (test/scan); staging deploy passes `production:gate`; alerting fires on synthetic health failure.

---

### Phase 8 — Test & E2E rebalance, then go-live cutover

**Goal:** trustworthy quality signal and a safe path to first live customer.

**Tasks:**
- Expand behavior + integration coverage for every new system (auth, UI flows, Twilio, AI, Stripe, rate limiting).
- E2E for real user journeys (not just the investor demo): signup → onboard → import → campaign → live-gated send → inbox → resolve; billing; compliance/A2P.
- Finalize the **go-live runbook**: complete `docs/PRODUCTION_GO_LIVE.md` checklist execution — secret manager wired, A2P APPROVED, allowlisted test send passed, billing gate verified, observability live, break-glass documented; staged rollout per-org via feature flag (not blanket `ALLOW_PRODUCTION_EXTERNALS=true`).

**Verification:** full `npm run validate` + E2E green; staging soak; first live send to a real consented number via the allowlisted path; rollback drill.

---

## Sequencing & Parallelization

```
Phase 0 (cleanup + defect fixes) ───────────── runs alongside everything
Phase 1 Auth/RBAC ──┬─> Phase 2 UI ───────────────────────────┐
                    │                                          ├─> Phase 8 (tests/E2E + go-live)
Phase 3 Twilio ─────┼─> Phase 4 Compliance ───────────────────┤
Phase 5 AI ─────────┤                                          │
Phase 6 Stripe ─────┘ (needs Phase 1 org/auth)                 │
Phase 7 Infra (secrets/rate-limit/observability) ── precedes go-live, supports 3/5/6
```

- **Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 8.
- **Parallel backend track:** Phases 3, 5 can start once Phase 0 lands; Phase 4 follows 3; Phase 6 needs Phase 1.
- **Phase 7** is cross-cutting and must complete before any production go-live.

**Rough effort (focused AI-agent + review):** Phase 0 ~1 wk; Phase 1 ~1–2 wks; Phase 2 ~3–4 wks (largest); Phase 3 ~2 wks; Phase 4 ~1–2 wks; Phase 5 ~1 wk; Phase 6 ~2 wks; Phase 7 ~2 wks; Phase 8 ~1–2 wks. Significant overlap via parallel tracks.

---

## Key Risks

- **Compliance/legal:** A2P 10DLC registration is an external Twilio/carrier process with lead time and approval risk; start Phase 4's registration early. TCPA violations (sending to opted-out) are the highest-severity product risk — the send-time recheck in Phase 4 is non-negotiable.
- **Accidental live send:** mitigated by never weakening `evaluateMessagingHardGate()` + production gate; every phase keeps demo default.
- **Secret leakage:** keep redacted-metadata pattern; secrets only in secret manager; `npm run secrets:scan` in CI.
- **Scope creep from scaffolding:** resist regenerating read-only review pages; Phase 0 consolidation must hold.
- **Cost blowups:** AI token budgets and Twilio throughput caps (Phases 5/3).

---

## End-to-End Verification Strategy

1. **Per phase:** `npm run validate` (lint, typecheck, contracts:check, compliance:check, production:gate, tests, build) stays green; new behavior tests added.
2. **Tenant isolation:** automated test with two real Clerk orgs proving zero cross-org access.
3. **Gate integrity:** test proving each live path (SMS/AI/billing) is blocked in demo/CI and only reachable with all flags + gates satisfied.
4. **Demo path preserved:** `e2e/demo-path.spec.ts` passes after every phase.
5. **Live smoke (staging):** allowlisted Twilio test send → status webhook → message status update; STOP → opt-out → subsequent send blocked.
6. **Go-live:** `docs/PRODUCTION_GO_LIVE.md` checklist fully executed; staged per-org rollout; break-glass rollback drill.

---

## Open Decisions to Confirm

- Auth provider = **Clerk** (assumed; schema already has Clerk fields). Alternative: NextAuth/custom.
- AI provider = **Anthropic Claude** (assumed). Alternative: OpenAI or multi-provider.
- Hosting platform (Vercel + external worker, or Render/Fly/Railway/AWS for web+worker+redis+postgres together).
- How aggressively to trim scaffolding in Phase 0 (consolidate-and-keep vs. delete read-only review pages).
