# SignalStack SMS: Project Completion Plan (Providers First)

## Background & Motivation
SignalStack SMS is currently at Milestone 10, functioning as a robust, fully-featured system that is strictly locked into a local, demo-safe mode. It relies on a `dummy` messaging provider, a `fake` AI adapter, local-only billing models, and mocked Clerk authentication. To bring the product to completion, we must systematically replace these stubs with live production implementations while maintaining the repository's strict safety, compliance, and multi-tenancy invariants, as strictly outlined in `docs/PRODUCTION_GO_LIVE.md`.

## Scope & Impact
This implementation plan covers the complete transition to a production-ready state.
- **Communications:** Integrating the Twilio SDK for live SMS/MMS, A2P 10DLC compliance, and webhooks.
- **AI:** Connecting a live LLM provider (OpenAI/Anthropic) for generative features.
- **Identity & Security:** Transitioning from local auth placeholders to live Clerk JWT verification and implementing a real secret manager for provider credentials.
- **Billing:** Implementing Stripe for subscriptions and usage-based metering.
- **Infrastructure:** Realizing Vercel/AWS deployments, live PostgreSQL, Redis-backed BullMQ, and send-rate backpressure handling.
- **Impact:** The changes touch nearly all integration boundaries defined in the `CONTRACT-*.md` files. Core business logic remains untouched, but adapter implementations, external integrations, and the rigid environment gating (`production:gate`) will shift drastically.

## Proposed Solution: "Feature Unlocking" Approach
We will follow the **Feature Unlocking (Providers First)** approach. This focuses on rapidly validating the core business value—live text messaging and AI generation—by integrating the primary external providers first. These live features will initially be gated to internal administrators before we implement public-facing compliance, authentication, and billing infrastructure.

## Alternatives Considered
- *Secure Core (Infra/Billing First):* Implementing infrastructure and billing first. This was rejected in favor of the Feature Unlocking approach to accelerate validation of the core communications and AI workflows.

## Phased Implementation Plan

### Phase 1: Live Providers & AI (Admin Gated)
*Goal: Validate core SMS and AI capabilities in a live environment, adhering to the strict `production:gate` override requirements.*
1. **Twilio Adapter:** Implement `lib/messaging/provider/twilio-provider.ts` fulfilling `CONTRACT-PROVIDER-ADAPTER.md`. Integrate the official Twilio Node.js SDK.
2. **Twilio Webhooks:** Implement rigorous signature validation, idempotency, and status normalization in `/api/webhooks/twilio/inbound` and `/api/webhooks/twilio/status`.
3. **Live AI Adapter:** Swap `fake-ai-provider.ts` for a real OpenAI/Anthropic implementation for campaign generation, reply suggestion, and lead scoring.
4. **Secret Management:** Implement a real secret manager interface (e.g., AWS Secrets Manager, Vercel KV) for storing and retrieving Twilio and AI credentials. **Raw secrets must not be stored in the database.**
5. **Admin Guardrails:** Update the `LIVE_MESSAGING_ENABLED`, `AI_LIVE_ENABLED`, and `ALLOW_PRODUCTION_EXTERNALS=true` gates to ensure these features can only be activated for specific allowlisted internal testing organizations. Implement the manual break-glass runbook for disabling live sends.

### Phase 2: Compliance, A2P 10DLC, & Backpressure
*Goal: Ensure the platform can legally send messages at scale without violating provider limits.*
1. **A2P Registration Flow:** Build the submission pipeline in `lib/compliance/a2p.ts` to push `ComplianceProfile` data to Twilio's Trust Hub API.
2. **Go-Live UI:** Finalize the `/go-live` UI against the `PRODUCTION_GO_LIVE.md` criteria, allowing users to submit their compliance profiles.
3. **Automated Enforcement:** Update campaign preflight checks to strictly enforce approved A2P status and verify provider number ownership/readiness before allowing any live Twilio sends.
4. **Queue Backpressure:** Implement send-rate limits and queue backpressure within the BullMQ workers (`workers/bulk-send-worker.ts`) appropriate for Twilio's API limits to prevent rate-limit bans.

### Phase 3: Identity & Production Infrastructure
*Goal: Secure the tenant perimeter and prepare for scale.*
1. **Live Authentication:** Replace local Clerk mock utilities in `lib/auth/` with the official `@clerk/nextjs` SDK. Enforce strict JWT validation and tenant-role mapping for all `app/(dashboard)` and `/api/` routes.
2. **Deployment & Queues:** Set up staging/production hosting environments. Provision a live Redis instance, update `QUEUE_BACKEND=bullmq`, and activate the `workers/bullmq.ts` process in production to handle scheduled campaigns.
3. **Observability:** Integrate Sentry and Datadog to fulfill `docs/PRODUCTION_OBSERVABILITY.md` requirements. Ensure no message bodies or PII are leaked to observability platforms.

### Phase 4: Live Billing (Stripe)
*Goal: Monetize the platform and ungate self-serve usage.*
1. **Stripe Integration:** Install `stripe` SDK. Build the customer and subscription creation flows.
2. **Usage Metering:** Update `lib/billing/metering.ts` to sync local `UsageEvent` aggregations to Stripe's metered billing API.
3. **Billing UI:** Flesh out `/settings/billing` with Stripe Checkout integration and webhook handlers for subscription lifecycle events.
4. **Self-Serve Ungating:** Link the billing status to the `liveMessagingEnabled` organization toggle. Organizations that pass all checks (Compliance approved, Billing active, Secrets managed, Number verified) can toggle live sending.

## Verification & Testing
- **Providers:** Unit tests validating Twilio signature validation algorithms and fake-provider fallbacks. End-to-end tests for the allowlisted live testing path. Prove alternate send paths cannot bypass the centralized messaging hard gate.
- **Compliance:** Automated tests verifying that campaign preflight blocks sends for incomplete A2P profiles.
- **Billing Security:** Test coverage proving Stripe calls cannot happen in demo/CI.
- **Auth:** E2E tests validating real JWT enforcement and tenant isolation (`orgId` bleed checks).
- **Continuous Integration:** Ensure `npm run validate` and `npm run test:e2e:smoke` remain perfectly green. CI will strictly maintain `DEMO_MODE=true` to prevent live external calls during automated testing.

## Migration & Rollback Strategies
- **Non-Destructive DB:** All Prisma migrations will be strictly additive. 
- **Graceful Degradation:** If live Twilio fails, the system must degrade safely to a queued state.
- **Rollback Tags:** We will continue to use the `premerge` script to tag rollbacks (`rollback/premerge/YYYYMMDD-HHMMSS-<shortsha>`) before integrating each major phase into the `main` branch.