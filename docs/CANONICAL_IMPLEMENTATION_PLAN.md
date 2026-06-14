## Context Loaded

* current-agent: ChatGPT/orchestrator; no local clone was available in the container, so the public GitHub tree was inspected instead; latest observed `main` commit was `38c25a1` on May 19, 2026. ([GitHub][1])
* Files read: `README.md`, `PLAN.md`, `AGENTS.md`, `CRM-CONTRACT.md`, `docs/{PROJECT-CONTROL,LOCAL-GATE,MERGE-PLAYBOOK,NEXT-PROMPTS,WORKTREE-SETUP,FEATURE-BACKLOG}.md`, `prompts/{README,shared/MERGE,shared/IFTv22PC-YOLO,meta/LOOP,meta/SPRINT-ROLLOVER}.md`, `.cursor/rules/max-yolo.mdc`, `.claude/settings.json`, `.claude/hooks` listing, `package.json`. ([GitHub][2])
* Expected/limited: local `git status --short` unavailable; no root `SUMMARY.chatgpt.md`, `BLOCKERS.chatgpt.md`, or active next-feature prompt observed; historical per-agent prompt directories were discovered but not treated as active work orders. ([GitHub][3])
* Repo purpose + sprint: the source repo is an AI-coded, local-first Next.js/Prisma SMB CRM; Sprint 4B demo-hardening is present and no next feature sprint is selected. ([GitHub][2])
* Key invariant: `CRM-CONTRACT.md` controls canonical entities/routes/status values/adapters; local gate output outranks unverified claims. ([GitHub][4])
* Ownership zones: Codex owns server/data/seed zones, Claude app routes, Grok components/styles, Gemini tests/scripts; shared contracts/config require coordination. ([GitHub][5])
* Required carry-forward setup: source-of-truth docs, contracts, `SUMMARY/BLOCKERS`, ownership zones, one-command local gate, merge playbook, rollback tags, deterministic demo seed, and max-automation rules with hard safety gates. ([GitHub][6])
* Proceeding with a canonical SMS repo planning package that incorporates those repo patterns and adds live-message, billing, secrets, compliance, and tenant-isolation gates.

# 1. Product Definition

## Product

**Product codename:** `SignalStack SMS` [DEFAULT]
**Repo name:** `signalstack-sms` [DEFAULT]
**Category:** AI-first SMB SMS/MMS marketing, shared inbox, and lead-qualification SaaS.
**Primary market:** United States SMBs using A2P SMS/MMS over Twilio 10DLC [DEFAULT].
**Primary provider:** Twilio first, with a provider-adapter interface for Telnyx/Sinch later [DEFAULT].
**Default runtime mode:** demo/test mode; live SMS is disabled until explicit hard gates pass [DEFAULT].

## User

Primary users:

* SMB owner/operator who wants a simple texting platform.
* Marketing manager who imports contacts, segments lists, and sends campaigns.
* Sales rep who handles replies and qualifies leads.
* Support/customer-care rep who works a shared team inbox.
* Admin who manages users, phone numbers, compliance, billing metadata, and provider setup.

## Buyer

Primary buyer [DEFAULT]:

* SMB owner, general manager, head of revenue, or operations lead.
* They buy because they need campaign texting, reply management, consent records, AI help, and a lower-complexity alternative to enterprise contact-center tools.

## MVP Promise

A user can:

1. Create or join an organization.
2. Import contacts from CSV.
3. Store consent, opt-in source, tags, lists, and opt-out status.
4. Configure a Twilio-backed or dummy phone number.
5. Compose SMS/MMS campaigns with template variables.
6. Schedule or queue sends.
7. Receive delivery status events.
8. Manage two-way conversations in a shared inbox.
9. Assign, note, summarize, qualify, and resolve conversations.
10. Generate campaign copy and reply suggestions with AI.
11. View basic analytics and usage/billing records.
12. Demonstrate the complete flow safely without sending real SMS.

## Investor-Demo Goal

The demo must show an end-to-end product path in under 10 minutes:

1. Demo org loads with realistic contacts, campaigns, lists, tags, numbers, and conversations.
2. User imports a CSV.
3. User opens a compliance checklist and sees why a campaign is allowed or blocked.
4. User generates AI campaign copy.
5. User schedules a campaign.
6. Dummy provider simulates delivery and replies.
7. Inbox receives inbound replies, STOP, HELP, and lead-qualification examples.
8. AI summarizes a conversation and scores a lead.
9. Analytics and usage update.
10. Go-live checklist shows what remains before live sending.

## Explicit IN Scope

* Multi-tenant organizations.
* Users, memberships, and org-scoped roles.
* Contacts.
* CSV import.
* Lists, tags, and saved segments.
* Consent tracking.
* Opt-in source tracking.
* Opt-out state tracking.
* STOP/HELP handling.
* Phone-number/provider configuration.
* SMS/MMS campaign composer.
* Template variables.
* Scheduled sends.
* Bulk-send queue.
* Delivery-status webhooks.
* Two-way shared inbox.
* Conversation assignment.
* Internal notes.
* Open/resolved conversation states.
* AI campaign copy generation.
* AI reply suggestions.
* AI conversation summaries.
* AI lead qualification.
* Basic analytics.
* Billing/usage data model.
* Compliance checklist fields.
* Demo seed data.
* Automated tests.
* Agent-readable documentation.
* One-command validation.
* CI-driven integration.
* Parallel AI-agent worktrees.

## Explicit OUT of Scope

* No copied competitor assets, branding, layouts, or proprietary UI flows.
* No live SMS sending by default.
* No live billing charges in MVP.
* No production deployment automation until hard gates exist.
* No international compliance beyond documented US A2P 10DLC planning [DEFAULT].
* No advanced marketing automation journeys beyond campaign scheduling [DEFAULT].
* No voice calling [DEFAULT].
* No WhatsApp [DEFAULT].
* No short-code registration workflow [DEFAULT].
* No full CRM replacement [DEFAULT].
* No manual code-review requirement for normal green AI-generated changes.
* No human approval loops for routine local development.
* No external secrets committed to repo.
* No destructive production database operations.

# 2. Architecture Decisions

Yes. Incorporate these patterns from the existing CRM repo setup: source-of-truth docs, contract-first agent work, explicit ownership zones, `SUMMARY/BLOCKERS` handoffs, local gate scripts, deterministic demo seed, merge playbook, rollback tagging, scoped worktrees, and “max automation except hard external-impact gates.”

|  # | Decision                                                                                 | Reason                                                                            | How it helps autonomous AI coding                                 | Failure mode prevented                                |
| -: | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
|  1 | Use **Next.js App Router + TypeScript strict** [DEFAULT].                                | Full-stack routing, API routes, server actions, and React UI in one repo.         | Agents can work from predictable route/file conventions.          | Split-stack drift and unclear ownership.              |
|  2 | Use **PostgreSQL + Prisma** [DEFAULT].                                                   | Strong relational model for tenants, consent, queues, events, billing, analytics. | Schema becomes an executable contract.                            | Untracked data-shape drift.                           |
|  3 | Every tenant-scoped table must include `orgId` unless explicitly documented.             | SMS SaaS is multi-tenant and compliance-sensitive.                                | Agents get a simple invariant for queries/tests.                  | Cross-tenant data leaks.                              |
|  4 | Use **Clerk auth + app-local membership model** [DEFAULT].                               | Clerk handles identity; app controls org roles and tenant authorization.          | Agents avoid building auth from scratch.                          | Auth ambiguity and inconsistent role checks.          |
|  5 | Use **contracts before feature code**.                                                   | Parallel agents need stable interfaces.                                           | Backend, frontend, tests, AI, and docs can proceed independently. | Mid-sprint API/schema drift.                          |
|  6 | Keep `docs/`, `contracts/`, `AGENTS.md`, `PLAN.md`, `SUMMARY.*.md`, and `BLOCKERS.*.md`. | Proven repo-local coordination pattern from the CRM setup.                        | Agents can rehydrate context without chat history.                | Lost context and repeated questions.                  |
|  7 | Use **provider adapter** with Twilio implementation and dummy provider.                  | Twilio is first provider; future providers should not rewrite product logic.      | Agents can test sending without live SMS.                         | Provider lock-in and accidental live sends.           |
|  8 | Default to **demo/test mode**.                                                           | SMS has real-world external impact.                                               | Agents can exercise full flows safely.                            | Spam, cost, or accidental real-user messaging.        |
|  9 | Use **BullMQ + Redis** for scheduled/bulk sends [DEFAULT].                               | Sending must be retryable, observable, and rate-limited.                          | Agents can test jobs independently from UI.                       | Inline request sends, duplicate sends, poor recovery. |
| 10 | Enforce **idempotency keys** for sends and webhooks.                                     | Providers retry and queues retry.                                                 | Agents can build deterministic tests.                             | Duplicate messages and duplicate event records.       |
| 11 | Use **Zod at every boundary**.                                                           | API, webhooks, CSV, AI tools, queue payloads all need validation.                 | Agents can import schemas rather than guessing shapes.            | Invalid payloads and silent runtime failures.         |
| 12 | Use **feature flags for external impact**.                                               | “Least safeguards” does not mean unsafe live operations.                          | Agents can code freely while gates block harm.                    | Live SMS, live billing, secrets, deletion errors.     |
| 13 | Use **AI adapter with deterministic fake provider** [DEFAULT].                           | AI features must be testable without cost or nondeterminism.                      | Tests can assert fixed outputs.                                   | Flaky tests and unbounded LLM spend.                  |
| 14 | Use **one-command validation**.                                                          | PM will not manually debug routine build steps.                                   | Agents must self-repair until `npm run validate` passes.          | Partial/incomplete handoffs.                          |
| 15 | Use **CI mirror of local gate**.                                                         | Green local should mean green CI.                                                 | Auto-merge can safely proceed on green checks.                    | Manual review bottlenecks.                            |
| 16 | Use **rollback tags before integration merges**.                                         | Rollback should be mechanical.                                                    | PM can revert quickly without manual forensic review.             | Merge paralysis.                                      |
| 17 | Use **worktrees with owned globs**.                                                      | Parallel AI agents need conflict boundaries.                                      | Agents know exactly what they may edit.                           | Merge conflicts and accidental ownership violations.  |
| 18 | Use **scripts/tests for policy**, not prose.                                             | The project posture is automation-first.                                          | Agents hit concrete failures instead of interpreting policy.      | Compliance/security rules ignored.                    |

# 3. Repo Structure

```text
signalstack-sms/
├─ README.md
├─ PLAN.md
├─ AGENTS.md
├─ CONTRACTS.md
├─ SUMMARY.bootstrap.md
├─ BLOCKERS.bootstrap.md
├─ .env.example
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ next.config.mjs
├─ tsconfig.json
├─ eslint.config.mjs
├─ postcss.config.mjs
├─ tailwind.config.ts
├─ components.json
├─ playwright.config.ts
├─ vitest.config.ts
├─ prisma.config.ts
├─ docker-compose.yml
├─ Dockerfile
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     ├─ premerge.yml
│     └─ automerge.yml
├─ .cursor/
│  └─ rules/
│     └─ max-yolo.mdc
├─ .claude/
│  ├─ settings.json
│  └─ hooks/
│     ├─ block-destructive.mjs
│     ├─ protect-files.mjs
│     ├─ protect-agent-zones.mjs
│     ├─ validate-stop.mjs
│     └─ failure-log.mjs
├─ .gemini/
│  └─ settings.json
├─ app/
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ loading.tsx
│  ├─ error.tsx
│  ├─ not-found.tsx
│  ├─ page.tsx
│  ├─ (marketing)/
│  │  ├─ page.tsx
│  │  └─ demo/page.tsx
│  ├─ (auth)/
│  │  ├─ sign-in/[[...sign-in]]/page.tsx
│  │  └─ sign-up/[[...sign-up]]/page.tsx
│  ├─ (dashboard)/
│  │  ├─ layout.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ contacts/
│  │  │  ├─ page.tsx
│  │  │  ├─ import/page.tsx
│  │  │  └─ [contactId]/page.tsx
│  │  ├─ lists/page.tsx
│  │  ├─ segments/page.tsx
│  │  ├─ campaigns/
│  │  │  ├─ page.tsx
│  │  │  ├─ new/page.tsx
│  │  │  └─ [campaignId]/page.tsx
│  │  ├─ inbox/
│  │  │  ├─ page.tsx
│  │  │  └─ [conversationId]/page.tsx
│  │  ├─ templates/page.tsx
│  │  ├─ analytics/page.tsx
│  │  ├─ settings/
│  │  │  ├─ page.tsx
│  │  │  ├─ team/page.tsx
│  │  │  ├─ numbers/page.tsx
│  │  │  ├─ compliance/page.tsx
│  │  │  ├─ billing/page.tsx
│  │  │  └─ provider/page.tsx
│  │  └─ go-live/page.tsx
│  └─ api/
│     ├─ health/route.ts
│     ├─ orgs/current/route.ts
│     ├─ contacts/route.ts
│     ├─ contacts/[contactId]/route.ts
│     ├─ contacts/imports/route.ts
│     ├─ contacts/imports/[importId]/route.ts
│     ├─ lists/route.ts
│     ├─ tags/route.ts
│     ├─ segments/route.ts
│     ├─ templates/route.ts
│     ├─ campaigns/route.ts
│     ├─ campaigns/[campaignId]/route.ts
│     ├─ campaigns/[campaignId]/preflight/route.ts
│     ├─ campaigns/[campaignId]/schedule/route.ts
│     ├─ campaigns/[campaignId]/cancel/route.ts
│     ├─ inbox/conversations/route.ts
│     ├─ inbox/conversations/[conversationId]/route.ts
│     ├─ inbox/conversations/[conversationId]/messages/route.ts
│     ├─ inbox/conversations/[conversationId]/assign/route.ts
│     ├─ inbox/conversations/[conversationId]/notes/route.ts
│     ├─ inbox/conversations/[conversationId]/resolve/route.ts
│     ├─ ai/campaign-copy/route.ts
│     ├─ ai/reply-suggestion/route.ts
│     ├─ ai/conversation-summary/route.ts
│     ├─ ai/lead-qualification/route.ts
│     ├─ analytics/overview/route.ts
│     ├─ billing/usage/route.ts
│     ├─ settings/compliance/route.ts
│     ├─ settings/numbers/route.ts
│     ├─ settings/provider/route.ts
│     ├─ webhooks/twilio/inbound/route.ts
│     ├─ webhooks/twilio/status/route.ts
│     └─ demo/
│        ├─ seed/route.ts
│        ├─ inbound/route.ts
│        └─ delivery-events/route.ts
├─ components/
│  ├─ ui/
│  │  └─ README.md
│  ├─ layout/
│  │  ├─ app-shell.tsx
│  │  ├─ side-nav.tsx
│  │  └─ top-nav.tsx
│  ├─ contacts/
│  ├─ campaigns/
│  ├─ inbox/
│  ├─ compliance/
│  ├─ analytics/
│  ├─ billing/
│  └─ demo/
├─ contracts/
│  ├─ CONTRACT-DB.md
│  ├─ CONTRACT-API.md
│  ├─ CONTRACT-WEBHOOKS.md
│  ├─ CONTRACT-PROVIDER-ADAPTER.md
│  ├─ CONTRACT-AI.md
│  ├─ CONTRACT-BILLING.md
│  ├─ CONTRACT-TESTING.md
│  ├─ CONTRACT-COMPLIANCE.md
│  └─ CONTRACT-QUEUE.md
├─ docs/
│  ├─ PRODUCT_SPEC.md
│  ├─ ARCHITECTURE.md
│  ├─ DATA_MODEL.md
│  ├─ API_MAP.md
│  ├─ WEBHOOKS.md
│  ├─ PROVIDER_ADAPTER.md
│  ├─ COMPLIANCE.md
│  ├─ TESTING.md
│  ├─ AGENT_PROTOCOL.md
│  ├─ DEMO_MODE.md
│  ├─ RISK_REGISTER.md
│  ├─ LOCAL_GATE.md
│  ├─ MERGE_PLAYBOOK.md
│  ├─ WORKTREE_SETUP.md
│  ├─ NEXT_PROMPTS.md
│  ├─ DECISIONS.md
│  └─ SCHEMA_CHANGELOG.md
├─ prompts/
│  ├─ README.md
│  ├─ shared/
│  │  ├─ LOOP.md
│  │  ├─ MERGE.md
│  │  └─ SPRINT-ROLLOVER.md
│  ├─ codex/
│  │  └─ LOOP.md
│  ├─ claude/
│  │  └─ LOOP.md
│  ├─ gemini/
│  │  └─ LOOP.md
│  ├─ grok/
│  │  └─ LOOP.md
│  └─ manager/
│     ├─ INTEGRATION.md
│     └─ DISPATCH.md
├─ lib/
│  ├─ auth/
│  │  ├─ clerk.ts
│  │  ├─ current-org.ts
│  │  ├─ roles.ts
│  │  └─ require-auth.ts
│  ├─ db/
│  │  ├─ prisma.ts
│  │  ├─ tenant.ts
│  │  └─ repositories/
│  ├─ validation/
│  │  ├─ api.ts
│  │  ├─ contacts.ts
│  │  ├─ campaigns.ts
│  │  ├─ inbox.ts
│  │  ├─ compliance.ts
│  │  ├─ provider.ts
│  │  ├─ ai.ts
│  │  └─ billing.ts
│  ├─ compliance/
│  │  ├─ gates.ts
│  │  ├─ opt-out.ts
│  │  ├─ consent.ts
│  │  ├─ a2p.ts
│  │  └─ audit.ts
│  ├─ messaging/
│  │  ├─ provider/
│  │  │  ├─ types.ts
│  │  │  ├─ registry.ts
│  │  │  ├─ dummy-provider.ts
│  │  │  └─ twilio-provider.ts
│  │  ├─ render-template.ts
│  │  ├─ send-preflight.ts
│  │  ├─ status-map.ts
│  │  └─ inbound-router.ts
│  ├─ queue/
│  │  ├─ redis.ts
│  │  ├─ queues.ts
│  │  ├─ jobs.ts
│  │  ├─ schedulers.ts
│  │  └─ idempotency.ts
│  ├─ ai/
│  │  ├─ types.ts
│  │  ├─ adapter.ts
│  │  ├─ fake-ai-provider.ts
│  │  ├─ prompts.ts
│  │  ├─ campaign-copy.ts
│  │  ├─ reply-suggestion.ts
│  │  ├─ summary.ts
│  │  └─ lead-qualification.ts
│  ├─ billing/
│  │  ├─ usage.ts
│  │  ├─ stripe-types.ts
│  │  └─ metering.ts
│  ├─ csv/
│  │  ├─ parse.ts
│  │  └─ import-contacts.ts
│  ├─ analytics/
│  │  └─ overview.ts
│  ├─ demo/
│  │  ├─ constants.ts
│  │  ├─ fixtures.ts
│  │  └─ scenarios.ts
│  └─ utils/
│     ├─ dates.ts
│     ├─ phone.ts
│     ├─ errors.ts
│     └─ env.ts
├─ prisma/
│  ├─ schema.prisma
│  ├─ seed.ts
│  ├─ migrations/
│  └─ fixtures/
│     ├─ demo-org.json
│     ├─ demo-contacts.csv
│     ├─ demo-campaigns.json
│     └─ demo-conversations.json
├─ workers/
│  ├─ bulk-send-worker.ts
│  ├─ scheduled-send-worker.ts
│  ├─ webhook-worker.ts
│  └─ ai-worker.ts
├─ scripts/
│  ├─ setup.ts
│  ├─ validate.ts
│  ├─ premerge.ts
│  ├─ check-env-safety.ts
│  ├─ assert-no-live-send-in-ci.ts
│  ├─ check-migrations-safe.ts
│  ├─ tag-rollback.ts
│  ├─ local-gate.ps1
│  ├─ local-gate.sh
│  ├─ create-worktrees.ps1
│  ├─ create-worktrees.sh
│  ├─ check-worktrees.ps1
│  ├─ check-worktrees.sh
│  ├─ contracts/
│  │  └─ check.ts
│  ├─ compliance/
│  │  └─ check-gates.ts
│  └─ agent/
│     ├─ status.ts
│     ├─ handoff.ts
│     └─ repair.ts
├─ tests/
│  ├─ unit/
│  │  ├─ compliance/
│  │  ├─ messaging/
│  │  ├─ provider/
│  │  ├─ queue/
│  │  ├─ ai/
│  │  └─ billing/
│  ├─ integration/
│  │  ├─ api/
│  │  ├─ webhooks/
│  │  ├─ db/
│  │  └─ tenant-isolation/
│  ├─ contract/
│  │  ├─ api-contract.test.ts
│  │  ├─ db-contract.test.ts
│  │  ├─ provider-contract.test.ts
│  │  └─ testing-contract.test.ts
│  ├─ fixtures/
│  │  ├─ webhook-twilio-inbound.form.json
│  │  ├─ webhook-twilio-status.form.json
│  │  └─ csv-import-valid.csv
│  └─ setup/
│     └─ vitest.setup.ts
└─ e2e/
   ├─ demo-path.spec.ts
   ├─ contacts-import.spec.ts
   ├─ campaign-composer.spec.ts
   ├─ inbox.spec.ts
   ├─ compliance-gates.spec.ts
   └─ fixtures/
```

# 4. Source-of-Truth Docs

| Doc                        | Purpose                                                                  | Owner agent                  | Update rules                                                      | What breaks if stale                                  |
| -------------------------- | ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `README.md`                | Project entrypoint, local setup, command summary, current repo posture.  | docs-orchestrator            | Update when setup, scripts, stack, or gate changes.               | New agents run wrong commands.                        |
| `PLAN.md`                  | Current sprint, milestone status, active work, non-goals, merge posture. | orchestrator/PM              | Update at sprint start/end and after integration.                 | Agents pick stale tasks.                              |
| `AGENTS.md`                | Agent roster, ownership zones, worktree rules, allowed posture.          | orchestrator/PM              | Update before dispatching agents or changing globs.               | Agents edit wrong files.                              |
| `docs/PRODUCT_SPEC.md`     | Product scope, personas, workflows, demo promise.                        | docs-orchestrator            | Update only when PM changes product scope.                        | Feature agents build wrong workflows.                 |
| `docs/ARCHITECTURE.md`     | System diagram, decisions, boundaries, deployment assumptions.           | docs-orchestrator            | Update when stack, architecture, or runtime mode changes.         | Agents create incompatible subsystems.                |
| `docs/DATA_MODEL.md`       | Entities, relationships, tenant rules, indexes, privacy model.           | backend-data                 | Update with every schema change.                                  | Queries, migrations, and tests drift.                 |
| `docs/API_MAP.md`          | API route map, auth scopes, request/response schemas.                    | backend-data                 | Update with every API addition/removal.                           | Frontend and tests call wrong routes.                 |
| `docs/WEBHOOKS.md`         | Twilio inbound/status webhook behavior, signature, idempotency.          | backend-data                 | Update with webhook payload/schema/provider changes.              | Forged/duplicate webhooks or broken inbound handling. |
| `docs/PROVIDER_ADAPTER.md` | Provider interface and provider-specific mappings.                       | backend-data                 | Update before adding providers or changing send/status semantics. | Twilio logic leaks into app code.                     |
| `docs/COMPLIANCE.md`       | Consent, STOP/HELP, A2P fields, live-send gates, audit requirements.     | tests-quality + backend-data | Update when compliance gates or registration fields change.       | Unsafe send behavior or failed A2P prep.              |
| `docs/TESTING.md`          | Test strategy, fixtures, local/CI gate, Playwright paths.                | tests-quality                | Update when scripts or test coverage changes.                     | Green claims become unreliable.                       |
| `docs/AGENT_PROTOCOL.md`   | How agents read docs, edit zones, self-repair, report, and stop.         | orchestrator/PM              | Update when workflow changes.                                     | Agents ask routine questions or overstep.             |
| `docs/DEMO_MODE.md`        | Demo mode behavior, fake provider, fake AI, seeds, scenarios.            | tests-quality                | Update with demo fixtures/scenarios.                              | Investor demo path breaks.                            |
| `docs/RISK_REGISTER.md`    | Top risks, mitigations, warning signs.                                   | orchestrator/PM              | Update each milestone.                                            | Known risks recur as surprise blockers.               |
| `docs/LOCAL_GATE.md`       | Authoritative local gate and failure-handling sequence.                  | tests-quality                | Update with script changes.                                       | Agents falsely claim validation.                      |
| `docs/MERGE_PLAYBOOK.md`   | Integration order, rollback tags, red-branch handling.                   | orchestrator/PM              | Update when branch/worktree strategy changes.                     | Manual merge paralysis or unsafe merge.               |
| `docs/WORKTREE_SETUP.md`   | Worktree paths, branch names, setup commands.                            | orchestrator/PM              | Update when worktree topology changes.                            | Parallel agents collide.                              |
| `docs/NEXT_PROMPTS.md`     | Ready-to-dispatch next prompts and blocked prompts.                      | orchestrator/PM              | Update after every milestone or handoff.                          | PM dispatches obsolete prompts.                       |
| `docs/DECISIONS.md`        | Decision log with dates and rationale.                                   | docs-orchestrator            | Append only; do not rewrite history except typo fixes.            | Agents repeat settled debates.                        |
| `docs/SCHEMA_CHANGELOG.md` | Schema changes and migration notes.                                      | backend-data                 | Append with every Prisma migration.                               | Migration history becomes opaque.                     |

# 5. Integration Contracts

## Contract Change Process

1. Contract owner edits the relevant `CONTRACT-*.md`.
2. Owner updates matching Zod schemas and tests.
3. Owner runs `npm run contracts:check && npm run validate`.
4. Owner records change in `SUMMARY.<agent>.md`.
5. Consumer agents pull/cherry-pick the contract commit before continuing.
6. Breaking changes require a `CONTRACT-BREAKING:` heading and migration notes.
7. Mid-sprint unblock mechanism: add a temporary compatibility shim and deprecation note; remove the shim before milestone acceptance.

## Required Contracts

| Contract                       | Owner                          | Consumer agents                             | Frozen types                                                              | Zod schemas                                                                               | API routes                                              | DB tables                                                             | Events                                                              | Allowed change process                                          | Mid-sprint unblock                                              |
| ------------------------------ | ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `CONTRACT-DB.md`               | backend-data                   | frontend-ui, integrations-ai, tests-quality | Prisma model names, enum names, tenant invariants, indexes                | `OrgSchema`, `ContactSchema`, `CampaignSchema`, `MessageSchema`, `ConversationSchema`     | All routes consuming DB objects                         | All Prisma tables                                                     | `MessageQueued`, `MessageSent`, `InboundReceived`, `ConsentChanged` | Schema diff + migration + seed update + contract tests          | Add nullable field or compatibility mapper; no silent rename.   |
| `CONTRACT-API.md`              | backend-data                   | frontend-ui, tests-quality, integrations-ai | Request/response DTOs, error codes, auth scopes                           | All `*RequestSchema`, `*ResponseSchema`                                                   | All `/api/*` except webhooks                            | Indirect                                                              | API domain events                                                   | Route map update + API tests                                    | Version route or keep old field until consumers update.         |
| `CONTRACT-WEBHOOKS.md`         | backend-data                   | tests-quality, integrations-ai              | Twilio inbound/status normalized payloads                                 | `TwilioInboundWebhookSchema`, `TwilioStatusWebhookSchema`, `NormalizedWebhookEventSchema` | `/api/webhooks/twilio/*`                                | `WebhookEvent`, `MessageDeliveryEvent`, `Message`, `Conversation`     | `ProviderWebhookReceived`, `DeliveryStatusChanged`                  | Fixture update + signature test + idempotency test              | Store raw payload and ignore unknown fields.                    |
| `CONTRACT-PROVIDER-ADAPTER.md` | backend-data                   | integrations-ai, tests-quality, frontend-ui | `MessagingProvider`, `SendMessageInput`, `SendMessageResult`, status enum | `SendMessageInputSchema`, `ProviderStatusSchema`                                          | Provider settings and send pipeline                     | `PhoneNumber`, `ProviderCredential`, `Message`                        | `ProviderSendRequested`, `ProviderSendCompleted`                    | Interface update + dummy/Twilio implementation + provider tests | Adapter shim maps old result shape to new.                      |
| `CONTRACT-AI.md`               | integrations-ai                | frontend-ui, backend-data, tests-quality    | `AiTask`, `AiSuggestion`, `LeadQualificationResult`                       | `CampaignCopyRequestSchema`, `ReplySuggestionRequestSchema`, `LeadQualificationSchema`    | `/api/ai/*`                                             | `AiRun`, `AiSuggestion`, `LeadQualification`                          | `AiRunRequested`, `AiRunCompleted`                                  | Fake provider update + deterministic tests                      | Return safe fallback suggestion with `source="fallback"`.       |
| `CONTRACT-BILLING.md`          | integrations-ai + backend-data | frontend-ui, tests-quality                  | Usage event names, billing statuses, Stripe placeholder IDs               | `UsageEventSchema`, `BillingAccountSchema`                                                | `/api/billing/*`, `/api/analytics/*`                    | `UsageEvent`, `BillingAccount`, `SubscriptionRecord`, `InvoiceRecord` | `UsageRecorded`, `BillingStatusChanged`                             | Usage event registry update + tests                             | Record usage locally; no live Stripe calls.                     |
| `CONTRACT-TESTING.md`          | tests-quality                  | all agents                                  | Required scripts, fixtures, test tags, demo path                          | Test fixture schemas                                                                      | Test-only endpoints                                     | Demo seed tables                                                      | `DemoScenarioSeeded`                                                | Update test docs and CI together                                | Mark temporary skipped test with blocker and removal criterion. |
| `CONTRACT-COMPLIANCE.md`       | tests-quality + backend-data   | all agents                                  | Consent states, STOP/HELP behavior, go-live fields, live-send gates       | `ComplianceProfileSchema`, `ConsentStateSchema`, `SendGateResultSchema`                   | Campaign preflight, send, compliance settings, webhooks | `ComplianceProfile`, `ConsentEvent`, `AuditLog`, `Contact`            | `ConsentChanged`, `SendBlocked`, `StopReceived`, `HelpReceived`     | Update hard-gate tests first                                    | Gate returns `BLOCKED_WITH_REASON`; never bypass.               |
| `CONTRACT-QUEUE.md`            | backend-data                   | tests-quality, integrations-ai              | Queue names, job payloads, retry semantics                                | `BulkSendJobSchema`, `ScheduledSendJobSchema`, `WebhookJobSchema`                         | Schedule/cancel routes                                  | `QueueJob`, `CampaignRecipient`, `Message`                            | `JobQueued`, `JobCompleted`, `JobFailed`                            | Update job schema + worker tests                                | Add job version field and dual parser.                          |

# 6. Data Model

## Tenant Isolation Rule

Every row that belongs to an organization must include `orgId`.

Exceptions:

* `User`: global identity mapping; tenant access comes through `Membership`.
* `Org`: top-level tenant root.
* `WebhookEvent`: may temporarily have `orgId = null` only until provider phone/account resolution; unresolved events must not create messages.
* `SystemAuditLog`: may have `orgId = null` only for global environment/gate events.

All repository functions must accept `orgId` explicitly or derive it from `requireCurrentOrg()`.

## Core Entities

| Domain             | Entities                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Tenancy/Auth       | `Org`, `User`, `Membership`, `Invite`                                                                  |
| Contacts           | `Contact`, `ContactList`, `ListMember`, `Tag`, `ContactTag`, `Segment`, `ImportBatch`, `ImportRow`     |
| Consent/Compliance | `ComplianceProfile`, `ConsentEvent`, `AuditLog`, `A2PBrandProfile`, `A2PCampaignProfile`               |
| Messaging Provider | `PhoneNumber`, `ProviderCredential`, `ProviderRegistration`, `WebhookEvent`                            |
| Campaigns          | `MessageTemplate`, `Campaign`, `CampaignRecipient`, `ScheduledSend`, `Message`, `MessageDeliveryEvent` |
| Inbox              | `Conversation`, `ConversationAssignment`, `InternalNote`                                               |
| AI                 | `AiRun`, `AiSuggestion`, `LeadQualification`                                                           |
| Billing/Usage      | `BillingAccount`, `SubscriptionRecord`, `InvoiceRecord`, `UsageEvent`                                  |
| Queue              | `QueueJob`                                                                                             |

## Indexes

Required indexes:

* `Contact(orgId, phoneE164)` unique.
* `Contact(orgId, smsStatus)`.
* `Contact(orgId, createdAt)`.
* `Tag(orgId, name)` unique.
* `ContactList(orgId, name)` unique.
* `Campaign(orgId, status, scheduledAt)`.
* `CampaignRecipient(orgId, campaignId, contactId)` unique.
* `Message(orgId, providerMessageId)` unique where not null.
* `Message(orgId, conversationId, createdAt)`.
* `Conversation(orgId, status, assignedToUserId, updatedAt)`.
* `WebhookEvent(provider, providerEventId)` unique.
* `ConsentEvent(orgId, contactId, createdAt)`.
* `UsageEvent(orgId, eventName, createdAt)`.
* `QueueJob(orgId, queueName, status, runAt)`.

## Privacy/Security Concerns

* Store provider tokens encrypted or reference external secret storage [DEFAULT]; never expose raw provider credentials to client components.
* Store AI prompts/responses only where required for audit/debug; avoid unnecessary PII in AI logs [DEFAULT].
* Keep `Contact.phoneE164`, `Contact.email`, message bodies, and consent evidence tenant-scoped.
* Do not include message bodies in generic logs.
* Redact phone numbers in CI logs.
* Export/delete workflows are out of MVP [DEFAULT], but schema must support audit trails.

## Prisma Schema Sketch

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OrgRole {
  OWNER
  ADMIN
  MANAGER
  AGENT
  VIEWER
}

enum ContactSmsStatus {
  UNKNOWN
  OPTED_IN
  OPTED_OUT
  BLOCKED
}

enum ConsentSourceType {
  CSV_IMPORT
  WEB_FORM
  KEYWORD
  MANUAL
  API
  DEMO_SEED
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  QUEUED
  SENDING
  PAUSED
  COMPLETED
  CANCELLED
  FAILED
}

enum MessageDirection {
  OUTBOUND
  INBOUND
}

enum MessageKind {
  SMS
  MMS
}

enum MessageStatus {
  DRAFT
  QUEUED
  SENT
  DELIVERED
  FAILED
  UNDELIVERED
  RECEIVED
  BLOCKED
}

enum ConversationStatus {
  OPEN
  RESOLVED
}

enum ProviderName {
  DUMMY
  TWILIO
  TELNYX
  SINCH
}

enum ComplianceStatus {
  NOT_STARTED
  DRAFT
  READY_FOR_REVIEW
  SUBMITTED
  APPROVED
  REJECTED
  DISABLED
}

enum QueueJobStatus {
  WAITING
  ACTIVE
  COMPLETED
  FAILED
  CANCELLED
}

enum AiRunStatus {
  REQUESTED
  COMPLETED
  FAILED
  BLOCKED
}

model Org {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  clerkOrgId      String?  @unique
  demoMode        Boolean  @default(true)
  liveMessagingEnabled Boolean @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  memberships     Membership[]
  contacts        Contact[]
  complianceProfile ComplianceProfile?
  phoneNumbers    PhoneNumber[]
  campaigns       Campaign[]
  conversations   Conversation[]
  usageEvents     UsageEvent[]
}

model User {
  id          String   @id @default(cuid())
  clerkUserId String  @unique
  email       String  @unique
  name        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships Membership[]
  assignedConversations ConversationAssignment[]
  notes        InternalNote[]
}

model Membership {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  role      OrgRole
  createdAt DateTime @default(now())

  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@index([userId])
}

model ComplianceProfile {
  id                         String @id @default(cuid())
  orgId                      String @unique
  status                     ComplianceStatus @default(NOT_STARTED)

  businessLegalName          String?
  businessDbaName            String?
  businessType               String?
  businessIndustry           String?
  businessRegistrationIdType String?
  businessRegistrationNumber String?
  businessWebsiteUrl         String?
  privacyPolicyUrl           String?
  termsAndConditionsUrl      String?

  optInMethod                String?
  optInSourceDescription     String?
  sampleMessage1             String?
  sampleMessage2             String?
  messageFrequency           String?
  helpText                   String?
  optOutText                 String?
  brandSid                   String?
  campaignSid                String?
  reviewedAt                 DateTime?
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  org                        Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
}

model Contact {
  id              String   @id @default(cuid())
  orgId           String
  firstName       String?
  lastName        String?
  email           String?
  phoneE164       String
  smsStatus       ContactSmsStatus @default(UNKNOWN)
  consentSourceType ConsentSourceType?
  consentSourceDetail String?
  consentedAt     DateTime?
  optedOutAt      DateTime?
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  org             Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  consentEvents   ConsentEvent[]
  messages        Message[]
  campaignRecipients CampaignRecipient[]
  conversations   Conversation[]
  tags            ContactTag[]
  listMembers     ListMember[]

  @@unique([orgId, phoneE164])
  @@index([orgId, smsStatus])
  @@index([orgId, createdAt])
}

model ConsentEvent {
  id          String @id @default(cuid())
  orgId       String
  contactId   String
  eventType    String
  sourceType   ConsentSourceType
  sourceDetail String?
  previousStatus ContactSmsStatus?
  nextStatus   ContactSmsStatus
  messageId    String?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  contact      Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([orgId, contactId, createdAt])
}

model ContactList {
  id        String @id @default(cuid())
  orgId     String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members   ListMember[]

  @@unique([orgId, name])
}

model ListMember {
  id        String @id @default(cuid())
  orgId     String
  listId    String
  contactId String
  createdAt DateTime @default(now())

  list      ContactList @relation(fields: [listId], references: [id], onDelete: Cascade)
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([orgId, listId, contactId])
}

model Tag {
  id        String @id @default(cuid())
  orgId     String
  name      String
  createdAt DateTime @default(now())

  contacts  ContactTag[]

  @@unique([orgId, name])
}

model ContactTag {
  id        String @id @default(cuid())
  orgId     String
  tagId     String
  contactId String

  tag       Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([orgId, tagId, contactId])
}

model Segment {
  id          String @id @default(cuid())
  orgId       String
  name        String
  definition  Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([orgId, name])
}

model ImportBatch {
  id          String @id @default(cuid())
  orgId       String
  filename    String
  status      String
  totalRows   Int @default(0)
  validRows   Int @default(0)
  errorRows   Int @default(0)
  createdAt   DateTime @default(now())

  rows        ImportRow[]

  @@index([orgId, createdAt])
}

model ImportRow {
  id            String @id @default(cuid())
  orgId         String
  importBatchId String
  rowNumber     Int
  raw           Json
  status        String
  error         String?

  importBatch   ImportBatch @relation(fields: [importBatchId], references: [id], onDelete: Cascade)

  @@index([orgId, importBatchId])
}

model ProviderCredential {
  id          String @id @default(cuid())
  orgId       String
  provider    ProviderName
  label       String
  accountSid  String?
  encryptedSecretRef String?
  isActive    Boolean @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([orgId, provider])
}

model PhoneNumber {
  id              String @id @default(cuid())
  orgId           String
  provider        ProviderName
  phoneE164       String
  providerNumberId String?
  messagingServiceSid String?
  status          String
  capabilities    Json?
  isDefault       Boolean @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  org             Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, phoneE164])
  @@index([provider, providerNumberId])
}

model MessageTemplate {
  id        String @id @default(cuid())
  orgId     String
  name      String
  body      String
  variables Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([orgId, name])
}

model Campaign {
  id            String @id @default(cuid())
  orgId         String
  name          String
  status        CampaignStatus @default(DRAFT)
  messageKind   MessageKind @default(SMS)
  body          String
  mediaUrls     String[]
  scheduledAt   DateTime?
  sendStartedAt DateTime?
  sendCompletedAt DateTime?
  createdByUserId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  org           Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  recipients    CampaignRecipient[]

  @@index([orgId, status, scheduledAt])
}

model CampaignRecipient {
  id          String @id @default(cuid())
  orgId       String
  campaignId  String
  contactId   String
  status      String @default("PENDING")
  messageId   String?
  blockedReason String?
  createdAt   DateTime @default(now())

  campaign    Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  contact     Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([orgId, campaignId, contactId])
}

model Conversation {
  id              String @id @default(cuid())
  orgId           String
  contactId       String
  phoneNumberId   String?
  status          ConversationStatus @default(OPEN)
  lastMessageAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  org             Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact         Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  messages        Message[]
  assignments     ConversationAssignment[]
  notes           InternalNote[]

  @@index([orgId, status, updatedAt])
}

model ConversationAssignment {
  id              String @id @default(cuid())
  orgId           String
  conversationId  String
  userId          String
  assignedAt      DateTime @default(now())

  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user            User @relation(fields: [userId], references: [id])

  @@unique([orgId, conversationId, userId])
}

model InternalNote {
  id              String @id @default(cuid())
  orgId           String
  conversationId  String
  userId          String
  body            String
  createdAt       DateTime @default(now())

  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user            User @relation(fields: [userId], references: [id])

  @@index([orgId, conversationId, createdAt])
}

model Message {
  id                String @id @default(cuid())
  orgId             String
  contactId         String?
  conversationId    String?
  campaignId        String?
  direction         MessageDirection
  kind              MessageKind @default(SMS)
  status            MessageStatus
  fromPhoneE164     String
  toPhoneE164       String
  body              String
  mediaUrls         String[]
  provider          ProviderName
  providerMessageId String?
  idempotencyKey    String?
  sentAt            DateTime?
  receivedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  contact           Contact? @relation(fields: [contactId], references: [id])
  conversation      Conversation? @relation(fields: [conversationId], references: [id])
  deliveryEvents    MessageDeliveryEvent[]

  @@unique([orgId, idempotencyKey])
  @@unique([orgId, providerMessageId])
  @@index([orgId, conversationId, createdAt])
}

model MessageDeliveryEvent {
  id                String @id @default(cuid())
  orgId             String
  messageId         String
  provider          ProviderName
  providerEventId   String?
  providerMessageId String?
  status            MessageStatus
  raw               Json
  occurredAt        DateTime
  createdAt         DateTime @default(now())

  message           Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([orgId, messageId, occurredAt])
}

model WebhookEvent {
  id              String @id @default(cuid())
  orgId           String?
  provider        ProviderName
  eventType       String
  providerEventId String
  raw             Json
  processedAt     DateTime?
  error           String?
  createdAt       DateTime @default(now())

  @@unique([provider, providerEventId])
  @@index([orgId, createdAt])
}

model AiRun {
  id          String @id @default(cuid())
  orgId       String
  task        String
  status      AiRunStatus
  input       Json
  output      Json?
  error       String?
  createdAt   DateTime @default(now())
  completedAt DateTime?

  suggestions AiSuggestion[]

  @@index([orgId, task, createdAt])
}

model AiSuggestion {
  id        String @id @default(cuid())
  orgId     String
  aiRunId   String
  type      String
  payload   Json
  acceptedAt DateTime?
  createdAt DateTime @default(now())

  aiRun     AiRun @relation(fields: [aiRunId], references: [id], onDelete: Cascade)

  @@index([orgId, type, createdAt])
}

model LeadQualification {
  id             String @id @default(cuid())
  orgId          String
  conversationId String
  score          Int
  stage          String
  summary        String
  nextAction     String?
  createdAt      DateTime @default(now())

  @@index([orgId, conversationId, createdAt])
}

model UsageEvent {
  id          String @id @default(cuid())
  orgId       String
  eventName   String
  quantity    Int @default(1)
  unit        String
  metadata    Json?
  occurredAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  org         Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, eventName, occurredAt])
}

model BillingAccount {
  id               String @id @default(cuid())
  orgId            String @unique
  stripeCustomerId String?
  status           String @default("DEMO")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model SubscriptionRecord {
  id                   String @id @default(cuid())
  orgId                String
  stripeSubscriptionId String?
  status               String
  currentPeriodEnd     DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([orgId, status])
}

model InvoiceRecord {
  id              String @id @default(cuid())
  orgId           String
  stripeInvoiceId String?
  status          String
  amountCents     Int
  currency        String @default("usd")
  createdAt       DateTime @default(now())

  @@index([orgId, createdAt])
}

model QueueJob {
  id             String @id @default(cuid())
  orgId          String?
  queueName      String
  jobName        String
  status         QueueJobStatus
  jobKey         String
  payload        Json
  runAt          DateTime?
  attempts       Int @default(0)
  lastError      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([queueName, jobKey])
  @@index([orgId, queueName, status, runAt])
}

model AuditLog {
  id          String @id @default(cuid())
  orgId       String?
  actorUserId String?
  eventType   String
  entityType  String?
  entityId    String?
  before      Json?
  after       Json?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([orgId, eventType, createdAt])
}
```

# 7. API, Webhooks, and Provider Adapter

## API Route Map

| Method      | Path                                                 | Auth scope        | Request schema                               | Response schema                     | Error cases                      | Owner                        | Required tests          |
| ----------- | ---------------------------------------------------- | ----------------- | -------------------------------------------- | ----------------------------------- | -------------------------------- | ---------------------------- | ----------------------- |
| `GET`       | `/api/health`                                        | public            | none                                         | `HealthResponseSchema`              | none                             | backend-data                 | smoke                   |
| `GET`       | `/api/orgs/current`                                  | signed-in         | none                                         | `CurrentOrgResponseSchema`          | `401`, `403`                     | backend-data                 | auth/tenant             |
| `GET`       | `/api/contacts`                                      | org member        | `ContactListQuerySchema`                     | `ContactListResponseSchema`         | `401`, `403`, `422`              | backend-data                 | API + tenant            |
| `POST`      | `/api/contacts`                                      | org manager+      | `ContactCreateRequestSchema`                 | `ContactResponseSchema`             | duplicate phone, invalid consent | backend-data                 | API + compliance        |
| `PATCH`     | `/api/contacts/[contactId]`                          | org manager+      | `ContactUpdateRequestSchema`                 | `ContactResponseSchema`             | not found, cross-tenant          | backend-data                 | API + tenant            |
| `POST`      | `/api/contacts/imports`                              | org manager+      | multipart CSV + `ContactImportOptionsSchema` | `ImportBatchResponseSchema`         | invalid CSV, too large           | backend-data                 | CSV + seed              |
| `GET`       | `/api/lists`                                         | org member        | `ListQuerySchema`                            | `ListResponseSchema`                | auth                             | backend-data                 | API                     |
| `POST`      | `/api/lists`                                         | org manager+      | `ListCreateRequestSchema`                    | `ListItemResponseSchema`            | duplicate name                   | backend-data                 | API                     |
| `GET`       | `/api/tags`                                          | org member        | none                                         | `TagListResponseSchema`             | auth                             | backend-data                 | API                     |
| `POST`      | `/api/tags`                                          | org manager+      | `TagCreateRequestSchema`                     | `TagResponseSchema`                 | duplicate name                   | backend-data                 | API                     |
| `GET`       | `/api/segments`                                      | org member        | none                                         | `SegmentListResponseSchema`         | auth                             | backend-data                 | API                     |
| `POST`      | `/api/segments`                                      | org manager+      | `SegmentCreateRequestSchema`                 | `SegmentResponseSchema`             | invalid definition               | backend-data                 | segment                 |
| `GET`       | `/api/templates`                                     | org member        | none                                         | `TemplateListResponseSchema`        | auth                             | backend-data                 | API                     |
| `POST`      | `/api/templates`                                     | org manager+      | `TemplateCreateRequestSchema`                | `TemplateResponseSchema`            | invalid variables                | backend-data                 | render                  |
| `GET`       | `/api/campaigns`                                     | org member        | `CampaignListQuerySchema`                    | `CampaignListResponseSchema`        | auth                             | backend-data                 | API                     |
| `POST`      | `/api/campaigns`                                     | org manager+      | `CampaignCreateRequestSchema`                | `CampaignResponseSchema`            | invalid body/media               | backend-data                 | API                     |
| `PATCH`     | `/api/campaigns/[campaignId]`                        | org manager+      | `CampaignUpdateRequestSchema`                | `CampaignResponseSchema`            | non-draft edit blocked           | backend-data                 | lifecycle               |
| `POST`      | `/api/campaigns/[campaignId]/preflight`              | org manager+      | `CampaignPreflightRequestSchema`             | `CampaignPreflightResponseSchema`   | blocked by compliance            | backend-data + tests-quality | hard gate               |
| `POST`      | `/api/campaigns/[campaignId]/schedule`               | org manager+      | `CampaignScheduleRequestSchema`              | `CampaignScheduleResponseSchema`    | failed preflight, invalid time   | backend-data                 | queue                   |
| `POST`      | `/api/campaigns/[campaignId]/cancel`                 | org manager+      | `CampaignCancelRequestSchema`                | `CampaignResponseSchema`            | already sending/completed        | backend-data                 | queue                   |
| `GET`       | `/api/inbox/conversations`                           | org member        | `ConversationListQuerySchema`                | `ConversationListResponseSchema`    | auth                             | backend-data                 | API + tenant            |
| `GET`       | `/api/inbox/conversations/[conversationId]`          | org member        | none                                         | `ConversationDetailResponseSchema`  | not found                        | backend-data                 | API                     |
| `POST`      | `/api/inbox/conversations/[conversationId]/messages` | org agent+        | `InboxReplyRequestSchema`                    | `MessageResponseSchema`             | opted out, live disabled         | backend-data                 | compliance              |
| `POST`      | `/api/inbox/conversations/[conversationId]/assign`   | org manager+      | `ConversationAssignRequestSchema`            | `ConversationResponseSchema`        | invalid user                     | backend-data                 | role                    |
| `POST`      | `/api/inbox/conversations/[conversationId]/notes`    | org agent+        | `InternalNoteCreateRequestSchema`            | `InternalNoteResponseSchema`        | empty note                       | backend-data                 | API                     |
| `POST`      | `/api/inbox/conversations/[conversationId]/resolve`  | org agent+        | `ConversationResolveRequestSchema`           | `ConversationResponseSchema`        | invalid state                    | backend-data                 | API                     |
| `POST`      | `/api/ai/campaign-copy`                              | org manager+      | `CampaignCopyRequestSchema`                  | `CampaignCopyResponseSchema`        | AI disabled, quota               | integrations-ai              | fake AI                 |
| `POST`      | `/api/ai/reply-suggestion`                           | org agent+        | `ReplySuggestionRequestSchema`               | `ReplySuggestionResponseSchema`     | no conversation                  | integrations-ai              | fake AI                 |
| `POST`      | `/api/ai/conversation-summary`                       | org agent+        | `ConversationSummaryRequestSchema`           | `ConversationSummaryResponseSchema` | no messages                      | integrations-ai              | fake AI                 |
| `POST`      | `/api/ai/lead-qualification`                         | org agent+        | `LeadQualificationRequestSchema`             | `LeadQualificationResponseSchema`   | no conversation                  | integrations-ai              | fake AI                 |
| `GET`       | `/api/analytics/overview`                            | org member        | `AnalyticsOverviewQuerySchema`               | `AnalyticsOverviewResponseSchema`   | invalid date                     | backend-data                 | analytics               |
| `GET`       | `/api/billing/usage`                                 | org admin+        | `UsageQuerySchema`                           | `UsageResponseSchema`               | auth                             | integrations-ai              | billing                 |
| `GET/PATCH` | `/api/settings/compliance`                           | org admin+        | `ComplianceProfileUpdateSchema`              | `ComplianceProfileResponseSchema`   | invalid URL/text                 | backend-data                 | compliance              |
| `GET/POST`  | `/api/settings/numbers`                              | org admin+        | `PhoneNumberCreateSchema`                    | `PhoneNumberResponseSchema`         | provider disabled                | backend-data                 | provider                |
| `GET/PATCH` | `/api/settings/provider`                             | org owner/admin   | `ProviderSettingsUpdateSchema`               | redacted provider response          | secrets invalid                  | backend-data                 | env safety              |
| `POST`      | `/api/webhooks/twilio/inbound`                       | Twilio signature  | form body                                    | TwiML or `204`                      | invalid signature, duplicate     | backend-data                 | signature + idempotency |
| `POST`      | `/api/webhooks/twilio/status`                        | Twilio signature  | form body                                    | `204`                               | invalid signature, duplicate     | backend-data                 | signature + idempotency |
| `POST`      | `/api/demo/inbound`                                  | org admin in demo | `DemoInboundRequestSchema`                   | `DemoInboundResponseSchema`         | demo disabled                    | tests-quality                | demo path               |
| `POST`      | `/api/demo/delivery-events`                          | org admin in demo | `DemoDeliveryEventRequestSchema`             | response                            | demo disabled                    | tests-quality                | demo path               |

## Common Response Shapes

```ts
type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "TENANT_VIOLATION"
  | "COMPLIANCE_BLOCKED"
  | "LIVE_MODE_DISABLED"
  | "PROVIDER_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED";

type ApiErrorResponse = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
};
```

## Webhook Rules

Twilio current docs state that A2P 10DLC registration includes Brand information and Campaign information covering opt-in, opt-out, help, and purpose; Twilio also states that anyone sending SMS/MMS from a Twilio 10DLC number to the US must register for A2P 10DLC. ([Twilio][7])

Twilio webhook endpoints must validate `X-Twilio-Signature` with the server-side Twilio SDK or equivalent, using the exact URL and all parameters; Twilio warns that webhook parameters may evolve, so handlers must accept unknown fields while still validating signatures. ([Twilio][8])

Webhook requirements:

* Signature validation required outside `NODE_ENV=test` and `DEMO_MODE=true`.
* Raw payload stored in `WebhookEvent`.
* Unique idempotency key:

  * inbound: `provider + MessageSid`.
  * status: `provider + MessageSid + MessageStatus + timestamp` [DEFAULT].
* Unknown fields preserved in `raw`.
* Duplicate webhook returns `204` and does not mutate state twice.
* Inbound messages route through `handleInboundMessage()`.
* STOP/HELP handling executes before AI, assignment, or campaign logic.
* Delivery statuses can arrive out of order; state transition rules must prevent downgrading terminal statuses without recording raw event.
* Webhook handlers must return quickly and enqueue heavy work.

## Provider Adapter Interface

```ts
export type MessagingProviderName = "dummy" | "twilio" | "telnyx" | "sinch";

export type ProviderMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered"
  | "received"
  | "blocked";

export type SendMessageInput = {
  orgId: string;
  idempotencyKey: string;
  fromPhoneE164: string;
  toPhoneE164: string;
  body: string;
  mediaUrls?: string[];
  messagingServiceSid?: string;
  statusCallbackUrl?: string;
  metadata?: Record<string, string>;
};

export type SendMessageResult = {
  provider: MessagingProviderName;
  providerMessageId: string;
  status: ProviderMessageStatus;
  raw: unknown;
};

export type NormalizedInboundMessage = {
  provider: MessagingProviderName;
  providerEventId: string;
  providerMessageId: string;
  fromPhoneE164: string;
  toPhoneE164: string;
  body: string;
  mediaUrls: string[];
  receivedAt: Date;
  raw: unknown;
};

export type NormalizedDeliveryEvent = {
  provider: MessagingProviderName;
  providerEventId: string;
  providerMessageId: string;
  status: ProviderMessageStatus;
  errorCode?: string;
  errorMessage?: string;
  occurredAt: Date;
  raw: unknown;
};

export interface MessagingProvider {
  name: MessagingProviderName;

  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;

  normalizeInboundWebhook(raw: unknown): NormalizedInboundMessage;

  normalizeStatusWebhook(raw: unknown): NormalizedDeliveryEvent;

  verifyWebhookSignature(input: {
    url: string;
    headers: Headers;
    rawBody: string;
    parsedBody: Record<string, string>;
  }): Promise<boolean>;
}
```

## Dummy Provider Behavior

* Never sends external messages.
* Returns deterministic provider IDs: `dummy_msg_<hash>`.
* Simulates status progression: `queued -> sent -> delivered`.
* Can simulate failure when body contains `[FAIL_DELIVERY]`.
* Can simulate inbound replies through `/api/demo/inbound`.
* Emits fake delivery events through `/api/demo/delivery-events`.
* Supports STOP/HELP flow exactly like Twilio-normalized inbound messages.
* Used by default in development, tests, demo, and CI.

# 8. App Route and UI Map

## Next.js `app/` Tree

```text
app/
├─ layout.tsx                         # RSC root layout
├─ globals.css
├─ loading.tsx                        # global loading
├─ error.tsx                          # global error boundary
├─ not-found.tsx
├─ page.tsx                           # RSC marketing redirect/landing
├─ (marketing)/
│  ├─ page.tsx                        # RSC public landing [DEFAULT]
│  └─ demo/page.tsx                   # RSC demo explainer
├─ (auth)/
│  ├─ sign-in/[[...sign-in]]/page.tsx # Clerk client boundary
│  └─ sign-up/[[...sign-up]]/page.tsx # Clerk client boundary
├─ (dashboard)/
│  ├─ layout.tsx                      # RSC auth/org guard + shell
│  ├─ loading.tsx
│  ├─ error.tsx
│  ├─ dashboard/page.tsx              # RSC analytics overview
│  ├─ contacts/
│  │  ├─ page.tsx                     # RSC table shell + client filters
│  │  ├─ import/page.tsx              # client CSV uploader
│  │  └─ [contactId]/page.tsx         # RSC contact detail
│  ├─ lists/page.tsx                  # RSC + client edit dialogs
│  ├─ segments/page.tsx               # RSC + client segment builder
│  ├─ campaigns/
│  │  ├─ page.tsx                     # RSC campaign list
│  │  ├─ new/page.tsx                 # client composer + server actions
│  │  └─ [campaignId]/page.tsx        # RSC detail + client preflight
│  ├─ inbox/
│  │  ├─ page.tsx                     # RSC list + client polling
│  │  └─ [conversationId]/page.tsx    # RSC thread + client composer
│  ├─ templates/page.tsx              # RSC + client editor
│  ├─ analytics/page.tsx              # RSC charts
│  ├─ settings/
│  │  ├─ page.tsx                     # RSC settings overview
│  │  ├─ team/page.tsx                # RSC members
│  │  ├─ numbers/page.tsx             # RSC + client provider forms
│  │  ├─ compliance/page.tsx          # client checklist + RSC state
│  │  ├─ billing/page.tsx             # RSC usage/billing model
│  │  └─ provider/page.tsx            # client provider credential forms
│  └─ go-live/page.tsx                # RSC hard-gate checklist
└─ api/                               # route handlers
```

## UI Behavior

| Area                | Server/client split                                            | Realtime/polling                                      | Suspense/loading         | Error boundaries             |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | ---------------------------- |
| Dashboard           | RSC fetches analytics; charts client if interactive.           | Refresh on navigation [DEFAULT].                      | `dashboard/loading.tsx`. | Segment boundary.            |
| Contacts            | RSC initial table; client filters/import dialogs.              | No realtime.                                          | Table skeleton.          | Import-specific error panel. |
| Campaign composer   | Client form; server action/API for save/preflight/schedule.    | Queue status polls every 5s after schedule [DEFAULT]. | Composer skeleton.       | Preflight error box.         |
| Inbox               | RSC initial conversations; client thread composer and polling. | Poll every 5s [DEFAULT]; no WebSockets MVP.           | Thread skeleton.         | Conversation boundary.       |
| AI suggestions      | Client button calls `/api/ai/*`.                               | No streaming MVP [DEFAULT].                           | Inline pending state.    | AI fallback card.            |
| Compliance settings | Client checklist writes API; RSC loads state.                  | No realtime.                                          | Checklist skeleton.      | Validation summary.          |
| Analytics           | RSC aggregation; client date controls.                         | No realtime.                                          | Chart skeleton.          | Analytics error card.        |
| Demo mode           | Client scenario buttons call demo APIs.                        | Poll after scenario run.                              | Scenario progress.       | Demo reset panel.            |

## Server Actions

Use server actions only for low-risk form persistence:

* Save template.
* Save campaign draft.
* Save compliance profile.
* Assign conversation.
* Add internal note.

Use API routes for:

* CSV import.
* Campaign preflight/schedule/cancel.
* Sends.
* Webhooks.
* AI calls.
* Demo simulated events.

# 9. Compliance and Hard Gates

## A2P 10DLC Planning Verification

At planning time, Twilio’s A2P 10DLC docs identify Brand/business information and Campaign details as required registration inputs, including campaign description, opt-in/message flow, sample messages, use case, embedded links/phone flags, opt-in/opt-out/help messages, and opt-in/opt-out/help keywords. Twilio’s A2P overview says US 10DLC SMS/MMS traffic from applications must be registered and that registration includes information about sender identity and how users opt in, opt out, and receive help. ([Twilio][7])

Twilio also announced that starting June 30, 2026, `PrivacyPolicyUrl` and `TermsAndConditionsUrl` are required fields for new A2P 10DLC campaign registrations via the Messaging REST API, and both must be valid, publicly accessible URLs. Because this project is launching after May 20, 2026 planning and before/near that date window, the data model and gate checks must treat both fields as mandatory for live 10DLC readiness. ([Twilio][9])

## Required Compliance Fields

Persist these fields in `ComplianceProfile` and expose them in Settings → Compliance:

* `businessLegalName`
* `businessDbaName`
* `businessType`
* `businessIndustry`
* `businessRegistrationIdType`
* `businessRegistrationNumber`
* `businessWebsiteUrl`
* `privacyPolicyUrl`
* `termsAndConditionsUrl`
* `optInMethod`
* `optInSourceDescription`
* `sampleMessage1`
* `sampleMessage2`
* `messageFrequency`
* `helpText`
* `optOutText`
* `brandSid`
* `campaignSid`
* `status`

## Hard Product Rules

| Area                 | Rule                                                                                                                                                                      | Enforced by                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Opt-in tracking      | A contact cannot receive non-demo outbound campaign SMS unless `smsStatus=OPTED_IN`, `consentedAt` exists, and consent source exists.                                     | `lib/compliance/gates.ts`, `tests/unit/compliance/send-gates.test.ts` |
| Opt-out tracking     | STOP-like inbound messages immediately set `smsStatus=OPTED_OUT`, write `ConsentEvent`, and block future sends.                                                           | `lib/compliance/opt-out.ts`, webhook tests                            |
| STOP handling        | Normalize `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` [DEFAULT].                                                                                            | `normalizeOptOutKeyword()`                                            |
| HELP handling        | Normalize `HELP` and `INFO` [DEFAULT]; respond with configured help text only when live/demo response is allowed.                                                         | `handleHelpKeyword()`                                                 |
| Consent audit log    | Every consent state transition writes `ConsentEvent` and `AuditLog`.                                                                                                      | Repository wrapper + tests                                            |
| External sending     | Real provider `sendMessage()` blocked unless `LIVE_MESSAGING_ENABLED=true`, org live enabled, provider credentials present, compliance profile approved, and CI is false. | `assertCanSendExternal()`                                             |
| Billing restrictions | Stripe live billing calls blocked unless `LIVE_BILLING_ENABLED=true`; MVP records usage only.                                                                             | `lib/billing/metering.ts`                                             |
| Secrets restrictions | `.env.example` contains placeholders only; CI fails if live-looking secrets are committed.                                                                                | `scripts/check-env-safety.ts`, optional gitleaks                      |
| Destructive DB       | Production destructive operations blocked; local reset allowed only with `ALLOW_DB_RESET=true`.                                                                           | `scripts/check-migrations-safe.ts`                                    |
| Live-mode activation | Go-live page must pass checklist before org `liveMessagingEnabled=true`.                                                                                                  | `GoLiveGateSchema`, API guard                                         |
| Cross-tenant access  | All repo methods scope by `orgId`; tests attempt foreign IDs.                                                                                                             | tenant-isolation integration tests                                    |
| AI usage             | Live AI provider disabled unless `AI_PROVIDER` configured and `AI_LIVE_ENABLED=true`; fake provider default.                                                              | `lib/ai/adapter.ts`                                                   |
| CI safety            | CI sets `DEMO_MODE=true`, `LIVE_MESSAGING_ENABLED=false`, `LIVE_BILLING_ENABLED=false`; tests fail if live provider is invoked.                                           | GitHub Actions + `assert-no-live-send-in-ci.ts`                       |

## Gate Result Shape

```ts
export type SendGateResult =
  | { allowed: true; mode: "demo" | "live"; warnings: string[] }
  | {
      allowed: false;
      code:
        | "CONTACT_NOT_OPTED_IN"
        | "CONTACT_OPTED_OUT"
        | "MISSING_CONSENT_SOURCE"
        | "COMPLIANCE_PROFILE_INCOMPLETE"
        | "A2P_NOT_APPROVED"
        | "ORG_LIVE_DISABLED"
        | "PROVIDER_NOT_CONFIGURED"
        | "LIVE_SEND_DISABLED"
        | "CI_SEND_BLOCKED"
        | "BILLING_BLOCKED"
        | "TENANT_VIOLATION";
      message: string;
      details?: unknown;
    };
```

## Required Gate Tests

* `send blocks opted-out contact`.
* `send blocks missing consent source`.
* `send blocks live provider in CI`.
* `send blocks incomplete compliance profile`.
* `STOP creates consent event and blocks future sends`.
* `HELP does not opt contact in`.
* `cross-tenant contact ID cannot be sent`.
* `demo mode uses dummy provider only`.
* `live mode requires explicit env + org flag + provider credentials`.
* `billing usage records locally but does not charge`.

# 10. Demo Mode

## Demo Mode Goals

Demo mode must let agents, PM, and investors exercise the whole product without:

* Sending real SMS.
* Charging real money.
* Using real provider secrets.
* Contacting real users.
* Mutating production data.

## Demo Defaults

```env
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake
```

## Seeded Demo Data

| Fixture                   | Contents                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `demo-org.json`           | One org, compliance profile, fake phone number, billing model.                  |
| `demo-contacts.csv`       | 75 contacts: opted-in, opted-out, missing consent, invalid phone, tagged leads. |
| `demo-campaigns.json`     | Draft, scheduled, completed, blocked, and failed campaigns.                     |
| `demo-conversations.json` | Open/resolved threads, assigned/unassigned, notes, STOP, HELP, qualified lead.  |
| `demo-ai.json` [DEFAULT]  | Precomputed suggestions, summaries, qualification outputs.                      |

## Fake Contacts

Required demo contact categories:

* Opted-in marketing contact.
* Opted-out contact.
* Contact with missing consent source.
* Contact with invalid phone.
* High-intent lead.
* Low-intent lead.
* Support conversation.
* HELP sender.
* STOP sender.
* MMS-capable contact [DEFAULT].

## Fake Conversations

Seed conversations:

* New inbound lead asking for pricing.
* Existing customer asking for support.
* STOP flow.
* HELP flow.
* AI-qualified sales lead.
* Resolved thread with internal note.
* Unassigned open thread.

## Fake Delivery Events

Dummy provider scenarios:

* Delivered.
* Failed due to invalid number.
* Blocked due to opt-out.
* Undelivered due to provider error.
* Delayed scheduled campaign.

## Simulated Inbound Messages

`POST /api/demo/inbound` accepts:

```ts
{
  fromPhoneE164: string;
  toPhoneE164: string;
  body: string;
  scenario?: "normal" | "stop" | "help" | "lead" | "support";
}
```

## STOP/HELP Demo Flows

* STOP updates contact status and shows audit trail.
* Future campaign preflight shows blocked recipient.
* HELP creates inbound message and optional dummy response.
* Both flows appear in inbox and analytics.

## Optional Allowlisted Live Test Path

Live test path [DEFAULT]:

* Requires `LIVE_MESSAGING_ENABLED=true`.
* Requires `ALLOWLISTED_TEST_NUMBERS="+15555550123,+15555550124"`.
* Requires org `liveMessagingEnabled=true`.
* Requires compliance profile complete.
* Allows sending only to allowlisted numbers until `PRODUCTION_LIVE_APPROVED=true`.
* CI and demo seeds can never enable this.

## No Real Billing Charges

* Billing settings page shows usage and Stripe placeholders.
* No Stripe checkout or subscription mutation in MVP [DEFAULT].
* Usage events are recorded locally.
* `LIVE_BILLING_ENABLED=false` in CI and demo.

## Go-Live Checklist

Go-live page must show pass/fail for:

* Provider credentials configured.
* Phone number configured.
* A2P Brand/Campaign IDs entered.
* Compliance profile complete.
* Privacy policy URL valid.
* Terms URL valid.
* Opt-in method documented.
* Help text present.
* Opt-out text present.
* Sample messages present.
* Test send to allowlisted number completed.
* No opted-out recipients in target list.
* Billing live flag intentionally enabled.
* Secrets scan passed.
* Production database migration check passed.

# 11. Automation Scripts and CI

## Package Scripts

```json
{
  "scripts": {
    "setup": "tsx scripts/setup.ts",
    "dev": "next dev",
    "worker": "tsx workers/bulk-send-worker.ts",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test e2e/demo-path.spec.ts",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "tsx scripts/check-migrations-safe.ts --reset && prisma migrate reset --force && npm run db:seed",
    "demo:seed": "tsx prisma/seed.ts --demo",
    "contracts:check": "tsx scripts/contracts/check.ts",
    "compliance:check": "tsx scripts/compliance/check-gates.ts",
    "secrets:scan": "tsx scripts/check-env-safety.ts",
    "validate": "tsx scripts/validate.ts",
    "agent:status": "tsx scripts/agent/status.ts",
    "agent:handoff": "tsx scripts/agent/handoff.ts",
    "agent:repair": "tsx scripts/agent/repair.ts",
    "ci": "npm run validate",
    "premerge": "tsx scripts/premerge.ts"
  }
}
```

## Script Definitions

| Script             | Exact command                                   | Purpose                                                                           | Expected output                    | Failure handling                              |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| `setup`            | `npm run setup`                                 | Install/check local defaults, validate env template, initialize demo-safe config. | Setup summary and next command.    | Fix missing files; never create real secrets. |
| `dev`              | `npm run dev`                                   | Run Next dev server.                                                              | Local URL.                         | Report port/env issue.                        |
| `worker`           | `npm run worker`                                | Run BullMQ worker.                                                                | Worker connected to Redis.         | If Redis missing, print Docker command.       |
| `build`            | `npm run build`                                 | Production build.                                                                 | Next build success.                | Run `agent:repair`.                           |
| `typecheck`        | `npm run typecheck`                             | TypeScript strict validation.                                                     | No TS errors.                      | Fix introduced types.                         |
| `lint`             | `npm run lint`                                  | Static lint.                                                                      | No warnings.                       | Fix lint or document blocker.                 |
| `test`             | `npm run test`                                  | Unit/integration/contract tests.                                                  | Vitest pass.                       | Repair failing tests/code.                    |
| `test:e2e`         | `npm run test:e2e`                              | Full Playwright suite.                                                            | E2E pass.                          | Save traces, repair selectors/flows.          |
| `db:migrate`       | `npm run db:migrate`                            | Local migration.                                                                  | Migration applied.                 | If schema invalid, repair schema.             |
| `db:seed`          | `npm run db:seed`                               | Seed base data.                                                                   | Seed summary.                      | Repair fixtures.                              |
| `db:reset`         | `ALLOW_DB_RESET=true npm run db:reset`          | Local destructive reset.                                                          | Reset + seed pass.                 | Block if production-like env.                 |
| `demo:seed`        | `npm run demo:seed`                             | Seed full demo.                                                                   | Demo org ID and login notes.       | Repair fixtures.                              |
| `contracts:check`  | `npm run contracts:check`                       | Ensure docs/contracts/schema names align.                                         | Contract check pass.               | Update stale contract/doc/schema.             |
| `compliance:check` | `npm run compliance:check`                      | Run hard-gate assertions.                                                         | Gate pass.                         | Never bypass; fix gate logic.                 |
| `secrets:scan`     | `npm run secrets:scan`                          | Check env/files for committed secrets.                                            | No secret-like values.             | Remove/rotate secret; fail CI.                |
| `validate`         | `npm run validate`                              | One-command local gate.                                                           | All checks pass summary.           | Run `agent:repair`, fix own changes.          |
| `agent:status`     | `npm run agent:status`                          | Print branch, status, docs freshness, ownership hints.                            | Agent status report.               | Used before work.                             |
| `agent:handoff`    | `npm run agent:handoff -- --agent backend-data` | Generate handoff template.                                                        | Updated SUMMARY/BLOCKERS template. | Fill manually if script fails.                |
| `agent:repair`     | `npm run agent:repair`                          | Diagnose common failures.                                                         | Suggested repair list.             | Apply scoped fixes.                           |
| `ci`               | `npm run ci`                                    | CI alias.                                                                         | Same as validate.                  | Fail PR.                                      |
| `premerge`         | `npm run premerge`                              | Integration checks, rollback tag prompt, ownership scan.                          | Merge eligibility result.          | Do not merge red branch.                      |

## PowerShell Local Gate

```powershell
npm install
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
npx playwright install chromium
npm run test:e2e:smoke
```

## Bash Equivalent

```bash
npm install
cp -n .env.example .env.local || true
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
npx playwright install chromium
npm run test:e2e:smoke
```

## GitHub Actions

### `.github/workflows/ci.yml`

Jobs:

1. `env-safety`

   * Check no live SMS/billing env vars are set.
   * Run `npm run secrets:scan`.
   * Run `npm run compliance:check`.
2. `install`

   * `npm ci`.
   * Cache npm and Playwright.
3. `typecheck`

   * `npm run typecheck`.
4. `lint`

   * `npm run lint`.
5. `prisma`

   * `npm run db:generate`.
   * `npm run db:validate`.
6. `unit-integration-contract`

   * Start Postgres/Redis services.
   * `npm run db:migrate`.
   * `npm run demo:seed`.
   * `npm run test`.
7. `playwright-smoke`

   * `npx playwright install chromium`.
   * `npm run test:e2e:smoke`.
   * Upload traces/screenshots on failure.
8. `build`

   * `npm run build`.
9. `artifact-upload`

   * Upload test reports, Playwright traces, coverage, contract check output.
10. `safe-automerge`

* Only for PRs labeled `automerge/ai-safe`.
* Requires all jobs green.
* Fails if PR touches hard-gate files without `orchestrator-approved` label [DEFAULT].
* Does not run for production deployment.

### CI Safety Env

```yaml
env:
  NODE_ENV: test
  DEMO_MODE: "true"
  LIVE_MESSAGING_ENABLED: "false"
  LIVE_BILLING_ENABLED: "false"
  MESSAGING_PROVIDER: dummy
  AI_PROVIDER: fake
```

### Rollback Tag Creation

Before integration merges:

```powershell
npm run premerge
tsx scripts/tag-rollback.ts --prefix rollback/premerge
```

Tag format:

```text
rollback/premerge/YYYYMMDD-HHMMSS-<shortsha>
```

### Prevention of Live External Actions in CI

CI must fail if:

* `LIVE_MESSAGING_ENABLED=true`.
* `LIVE_BILLING_ENABLED=true`.
* `MESSAGING_PROVIDER=twilio` with live credentials.
* `AI_PROVIDER` is live and `AI_LIVE_ENABLED=true`.
* Any test attempts `TwilioProvider.sendMessage()` instead of `DummyProvider.sendMessage()`.

# 12. Worktree and Merge Strategy

## Worktrees

| Worktree            | Branch name                     | Owner role            | Owned globs                                                                                                                                                                                                     | Off-limits globs                                                               | Contracts consumed               | Contracts produced                             | Allowed commands                                                  | Validation command                                             | Merge criteria                                       | Rollback method                              | Handoff artifact                                                |
| ------------------- | ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `main`              | `main`                          | PM/integration only   | Integration docs, merge commits, rollback tags                                                                                                                                                                  | Feature implementation unless emergency                                        | All                              | None                                           | `git fetch`, `npm run premerge`, `npm run validate`, merge/revert | `npm run validate && npm run test:e2e:smoke`                   | All target branches green; no active blockers        | `git revert <merge-sha>` or rollback tag     | `SUMMARY.integration.md`                                        |
| `backend-data`      | `backend-data/m<N>-<slug>`      | Backend/data agent    | `prisma/**`, `lib/db/**`, `lib/validation/**`, `lib/compliance/**`, `lib/messaging/**`, `lib/queue/**`, `workers/**`, `app/api/**`, `contracts/CONTRACT-{DB,API,WEBHOOKS,PROVIDER-ADAPTER,QUEUE,COMPLIANCE}.md` | `components/**`, most `app/(dashboard)/**` UI except API dependencies          | API, AI, billing, testing        | DB, API, webhooks, provider, queue, compliance | npm, prisma, vitest, local gate                                   | `npm run validate`                                             | Contract tests pass; schema docs updated; seed works | Revert branch merge; migration rollback note | `SUMMARY.backend-data.md`, `BLOCKERS.backend-data.md`           |
| `frontend-ui`       | `frontend-ui/m<N>-<slug>`       | Frontend/UI agent     | `app/(marketing)/**`, `app/(auth)/**`, `app/(dashboard)/**`, `components/**`, `app/globals.css`, `tailwind.config.ts`                                                                                           | `prisma/**`, provider internals, worker internals                              | DB, API, AI, billing, compliance | UI route map updates                           | npm, Next build, Playwright smoke                                 | `npm run typecheck && npm run build && npm run test:e2e:smoke` | No API contract drift; UI demo path works            | Revert branch merge                          | `SUMMARY.frontend-ui.md`, `BLOCKERS.frontend-ui.md`             |
| `integrations-ai`   | `integrations-ai/m<N>-<slug>`   | Integrations/AI agent | `lib/ai/**`, `lib/billing/**`, `app/api/ai/**`, `app/api/billing/**`, provider settings helpers, `contracts/CONTRACT-{AI,BILLING}.md`                                                                           | Core Prisma schema unless coordinated; UI except small integration affordances | DB, API, testing, provider       | AI, billing                                    | npm, vitest, local fake provider tests                            | `npm run validate`                                             | Fake AI deterministic; no live AI/billing calls      | Revert branch merge                          | `SUMMARY.integrations-ai.md`, `BLOCKERS.integrations-ai.md`     |
| `tests-quality`     | `tests-quality/m<N>-<slug>`     | Tests/quality agent   | `tests/**`, `e2e/**`, `scripts/**`, `playwright.config.ts`, `vitest.config.ts`, `docs/TESTING.md`, `docs/DEMO_MODE.md`, `contracts/CONTRACT-TESTING.md`                                                         | Product feature code except minimal testability hooks                          | All                              | Testing, demo-mode test rules                  | npm, Playwright, scripts                                          | `npm run validate && npm run test:e2e:smoke`                   | Tests assert existing contracts; no product rewrites | Revert branch merge                          | `SUMMARY.tests-quality.md`, `BLOCKERS.tests-quality.md`         |
| `docs-orchestrator` | `docs-orchestrator/m<N>-<slug>` | Docs/PM agent         | `docs/**`, `contracts/**`, `PLAN.md`, `AGENTS.md`, `README.md`, `prompts/**`, `SUMMARY.*`, `BLOCKERS.*`                                                                                                         | Implementation files unless correcting generated docs references               | All                              | All source docs                                | npm docs checks, contract checks                                  | `npm run contracts:check && npm run validate`                  | Docs match code; no stale work orders                | Revert docs merge                            | `SUMMARY.docs-orchestrator.md`, `BLOCKERS.docs-orchestrator.md` |

## Worktree Paths [DEFAULT]

PowerShell:

```powershell
C:\dev\signalstack-sms
C:\dev\signalstack-sms-backend-data
C:\dev\signalstack-sms-frontend-ui
C:\dev\signalstack-sms-integrations-ai
C:\dev\signalstack-sms-tests-quality
C:\dev\signalstack-sms-docs-orchestrator
```

Bash:

```bash
~/dev/signalstack-sms
~/dev/signalstack-sms-backend-data
~/dev/signalstack-sms-frontend-ui
~/dev/signalstack-sms-integrations-ai
~/dev/signalstack-sms-tests-quality
~/dev/signalstack-sms-docs-orchestrator
```

## Merge Order

Default merge order:

1. `docs-orchestrator` contract/doc updates.
2. `backend-data`.
3. `integrations-ai`.
4. `frontend-ui`.
5. `tests-quality`.
6. Final `main` validation.

Change merge order only when dependencies require it and record the reason in `SUMMARY.integration.md`.

## Conflict Policy

* Contract conflict: stop feature merge, resolve contract first.
* Schema conflict: backend-data owns final resolution.
* UI conflict: frontend-ui owns final resolution.
* Test conflict: tests-quality owns final assertion; implementation owner fixes product code.
* Docs conflict: docs-orchestrator resolves stale references.
* Never hide a conflict by deleting tests or weakening hard gates.

## Rollback-Tag Policy

Before each integration merge:

```powershell
tsx scripts/tag-rollback.ts --prefix rollback/premerge
```

If merge breaks gate:

```powershell
git revert <merge-sha>
npm run validate
```

If multiple merges break the gate:

```powershell
git reset --hard <rollback-tag> # integration worktree only, after recording blocker
```

## Contract Updates Before Full Integration

Consumer worktrees receive contract changes by:

1. Pulling `main` after docs-orchestrator contract merge; or
2. Cherry-picking the contract commit; or
3. Applying a generated patch from `contracts/`.

No consumer may assume a changed API/schema without reading the updated contract.

# 13. Agent Work Orders

## A. Repo Bootstrap Agent

**Mission:** Complete Milestone 0 only. Initialize the repo, source-of-truth docs, contracts, scripts, CI skeleton, demo/test-mode conventions, and validation command.

**Read first:**

* This planning package.
* `README.md` after creating it.
* `PLAN.md`.
* `AGENTS.md`.
* `docs/LOCAL_GATE.md`.
* `docs/AGENT_PROTOCOL.md`.
* All `contracts/CONTRACT-*.md`.

**Files to modify:**

* Root config files.
* `docs/**`.
* `contracts/**`.
* `scripts/**`.
* `.github/workflows/**`.
* `prisma/schema.prisma` minimal stub.
* `tests/**` minimal smoke tests.
* `SUMMARY.bootstrap.md`, `BLOCKERS.bootstrap.md`.

**Files never to modify:**

* No feature implementation beyond bootstrap stubs.
* No real secrets.
* No live provider credentials.

**Commands to run:**

```powershell
npm install
npm run validate
```

**Tests required:**

* `npm run validate` passes or records a concrete blocker.
* `scripts/check-env-safety.ts` passes.
* `contracts:check` passes.

**Self-debug instructions:**

* Fix errors introduced by bootstrap.
* Prefer minimal stubs over missing scripts.
* Do not add live external dependencies beyond package install.
* If build fails due missing app shell, create minimal page/layout.

**Stop condition:**

* Milestone 0 passes `npm run validate`, or a blocker is recorded with exact reproduction.

**Final report format:**

```text
Agent: repo-bootstrap
Branch:
Files created:
Files modified:
Commands run:
Validation result:
Known issues:
Next recommended prompt:
```

**Handoff artifact:** `SUMMARY.bootstrap.md` and `BLOCKERS.bootstrap.md`.

## B. Backend/Data Agent

**Mission:** Build database, validation, repositories, compliance gates, provider adapter, webhook handlers, and queue foundations.

**Read first:**

* `README.md`
* `PLAN.md`
* `AGENTS.md`
* `contracts/CONTRACT-DB.md`
* `contracts/CONTRACT-API.md`
* `contracts/CONTRACT-WEBHOOKS.md`
* `contracts/CONTRACT-PROVIDER-ADAPTER.md`
* `contracts/CONTRACT-COMPLIANCE.md`
* `docs/DATA_MODEL.md`
* `docs/API_MAP.md`
* `docs/WEBHOOKS.md`
* `docs/COMPLIANCE.md`

**Files to modify:**

* `prisma/**`
* `lib/db/**`
* `lib/validation/**`
* `lib/compliance/**`
* `lib/messaging/**`
* `lib/queue/**`
* `workers/**`
* `app/api/**`
* Backend-owned contracts/docs.

**Files never to modify:**

* `components/**`
* `app/(dashboard)/**` except API-dependent type imports by agreement.
* `e2e/**` except adding backend fixtures with tests-quality coordination.

**Commands to run:**

```powershell
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run test
npm run validate
```

**Tests required:**

* DB contract tests.
* API route tests.
* Webhook signature/idempotency tests.
* Compliance gate tests.
* Provider adapter tests.
* Queue tests.

**Self-debug instructions:**

* If Prisma breaks, fix schema and migration.
* If tenant tests fail, repair repository scoping.
* If provider tests fail, use dummy provider unless live flag explicitly enabled in a test fixture.

**Stop condition:**

* Assigned milestone passes validation or blocker is recorded.

**Final report format:**

```text
Agent: backend-data
Branch:
Contracts changed:
Schema changes:
API routes added/changed:
Tests added:
Commands run:
Validation result:
Risks/blockers:
Handoff notes:
```

**Handoff artifact:** `SUMMARY.backend-data.md`, `BLOCKERS.backend-data.md`.

## C. Frontend/UI Agent

**Mission:** Build app shell, dashboard, contacts, import UI, campaign composer, inbox, settings, compliance checklist, analytics, and demo path UI.

**Read first:**

* `README.md`
* `PLAN.md`
* `AGENTS.md`
* `docs/PRODUCT_SPEC.md`
* `docs/API_MAP.md`
* `docs/DEMO_MODE.md`
* `docs/COMPLIANCE.md`
* `contracts/CONTRACT-API.md`
* `contracts/CONTRACT-AI.md`
* `contracts/CONTRACT-COMPLIANCE.md`

**Files to modify:**

* `app/(marketing)/**`
* `app/(auth)/**`
* `app/(dashboard)/**`
* `components/**`
* `app/globals.css`
* `tailwind.config.ts`

**Files never to modify:**

* `prisma/**`
* `workers/**`
* Provider adapter internals.
* Compliance gate internals.

**Commands to run:**

```powershell
npm run typecheck
npm run build
npm run test:e2e:smoke
npm run validate
```

**Tests required:**

* Playwright smoke for demo path.
* Campaign composer flow.
* Inbox flow.
* Compliance checklist rendering.
* No cross-tenant UI assumptions.

**Self-debug instructions:**

* If API route missing, use contract-compliant mock boundary only if documented.
* Do not alter backend contracts to satisfy UI.
* Prefer accessible labels and stable `data-testid` for E2E.

**Stop condition:**

* UI path works with demo seed and passes assigned checks.

**Final report format:**

```text
Agent: frontend-ui
Branch:
Routes/components changed:
API contracts consumed:
E2E coverage:
Commands run:
Validation result:
Known UI gaps:
Handoff notes:
```

**Handoff artifact:** `SUMMARY.frontend-ui.md`, `BLOCKERS.frontend-ui.md`.

## D. Integrations/AI Agent

**Mission:** Build AI adapter, fake deterministic AI provider, campaign copy, reply suggestions, summaries, lead qualification, usage/billing model, and no-live-cost gates.

**Read first:**

* `contracts/CONTRACT-AI.md`
* `contracts/CONTRACT-BILLING.md`
* `contracts/CONTRACT-API.md`
* `docs/ARCHITECTURE.md`
* `docs/DEMO_MODE.md`
* `docs/RISK_REGISTER.md`

**Files to modify:**

* `lib/ai/**`
* `lib/billing/**`
* `app/api/ai/**`
* `app/api/billing/**`
* `contracts/CONTRACT-AI.md`
* `contracts/CONTRACT-BILLING.md`
* AI/billing docs.

**Files never to modify:**

* `prisma/schema.prisma` unless backend-data coordinates schema change.
* UI pages except minimal integration hooks with frontend-ui coordination.
* Live provider keys or `.env.local`.

**Commands to run:**

```powershell
npm run test
npm run validate
```

**Tests required:**

* Fake AI deterministic outputs.
* Prompt input validation.
* AI blocked in CI unless fake provider.
* Usage event recorded for AI task.
* Billing never charges in demo/CI.

**Self-debug instructions:**

* If nondeterministic tests fail, replace live provider with fake provider.
* If schema field missing, file blocker or coordinate with backend-data.
* Do not call live LLM APIs.

**Stop condition:**

* AI endpoints return contract-compliant deterministic results in demo mode.

**Final report format:**

```text
Agent: integrations-ai
Branch:
AI tasks implemented:
Billing/usage changes:
Contracts changed:
Tests added:
Commands run:
Validation result:
Known issues:
Handoff notes:
```

**Handoff artifact:** `SUMMARY.integrations-ai.md`, `BLOCKERS.integrations-ai.md`.

## E. Tests/Quality Agent

**Mission:** Build the regression shield: unit, integration, contract, webhook, compliance, provider, queue, tenant-isolation, and Playwright demo tests.

**Read first:**

* `docs/TESTING.md`
* `docs/DEMO_MODE.md`
* `docs/COMPLIANCE.md`
* `contracts/CONTRACT-TESTING.md`
* All other contracts.

**Files to modify:**

* `tests/**`
* `e2e/**`
* `scripts/**`
* `playwright.config.ts`
* `vitest.config.ts`
* `docs/TESTING.md`
* `docs/DEMO_MODE.md`
* `contracts/CONTRACT-TESTING.md`

**Files never to modify:**

* Product implementation files except small testability hooks with owner coordination.
* Hard-gate tests must not be weakened to pass implementation.

**Commands to run:**

```powershell
npm run test
npm run test:e2e:smoke
npm run validate
```

**Tests required:**

* All categories listed in Section 15.
* Smoke demo path.
* CI-safe no-live-send assertion.

**Self-debug instructions:**

* If tests expose product bug, file blocker and add failing test unless assigned to fix.
* If selector flaky, improve accessibility/test ID; do not add arbitrary sleeps.
* If E2E fails due missing seed, fix seed or fixture with backend coordination.

**Stop condition:**

* Test suite covers MVP hard gates and demo path.

**Final report format:**

```text
Agent: tests-quality
Branch:
Tests added:
Scripts changed:
Coverage by risk:
Commands run:
Validation result:
Open blockers:
Handoff notes:
```

**Handoff artifact:** `SUMMARY.tests-quality.md`, `BLOCKERS.tests-quality.md`.

## F. Orchestrator/PM Agent

**Mission:** Keep docs/contracts/PLAN current, dispatch agents, merge green branches, create rollback tags, preserve velocity, and block only external-impact risks.

**Read first:**

* `README.md`
* `PLAN.md`
* `AGENTS.md`
* `docs/MERGE_PLAYBOOK.md`
* `docs/WORKTREE_SETUP.md`
* `docs/RISK_REGISTER.md`
* All `SUMMARY.*.md`
* All `BLOCKERS.*.md`

**Files to modify:**

* `PLAN.md`
* `AGENTS.md`
* `docs/**`
* `contracts/**` when coordinating.
* `prompts/**`
* `SUMMARY.integration.md`
* `BLOCKERS.integration.md`

**Files never to modify:**

* Feature implementation except emergency integration repairs documented in summary.
* Real secrets.
* Production deployment configs without explicit go-live milestone.

**Commands to run:**

```powershell
npm run agent:status
npm run premerge
tsx scripts/tag-rollback.ts --prefix rollback/premerge
npm run validate
npm run test:e2e:smoke
```

**Tests required:**

* Full validation after merge.
* Smoke demo path after merge.
* Contract check before dispatch.

**Self-debug instructions:**

* Do not merge branches with active hard-gate blockers.
* Do not wait for human review when checks are green and scope is safe.
* Revert bad merges mechanically and record blocker.

**Stop condition:**

* Milestone state updated and next prompts ready.

**Final report format:**

```text
Agent: orchestrator
Main SHA:
Branches reviewed:
Merged:
Rejected:
Rollback tag:
Validation result:
Next dispatch prompts:
Blockers:
```

**Handoff artifact:** `SUMMARY.integration.md`, `BLOCKERS.integration.md`, `docs/NEXT_PROMPTS.md`.

# 14. Milestone Plan

| Milestone                         | Goal                                                                    | Deliverables                                                                                            | Files likely touched                                                                  | Owner                              | Tests required                              | Acceptance criteria                                       | Failure modes                       | Fallback plan                                   |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- | --------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| 0: Repo bootstrap and automation  | Create repo skeleton, docs, contracts, scripts, CI, demo-safe defaults. | Next app skeleton, package scripts, docs/contracts stubs, env template, CI skeleton, validation script. | Root config, `docs/**`, `contracts/**`, `scripts/**`, `.github/**`, minimal `app/**`. | repo-bootstrap + docs-orchestrator | validate smoke, env safety, contract check. | `npm run validate` passes with stubs.                     | Missing scripts, build fails.       | Add minimal app/test stubs.                     |
| 1: Auth, orgs, database, layout   | Establish Clerk/org model, Prisma baseline, app shell.                  | Org/user/membership models, guarded dashboard layout.                                                   | `prisma/**`, `lib/auth/**`, `app/(dashboard)/**`, `components/layout/**`.             | backend-data + frontend-ui         | auth tests, tenant tests, build.            | Demo org accessible; routes guarded.                      | Clerk assumptions block local demo. | Mock local auth adapter in demo mode.           |
| 2: Core domain objects            | Contacts, import, lists, tags, segments, templates.                     | CRUD APIs, CSV import, UI tables/forms.                                                                 | `app/api/contacts/**`, `lib/csv/**`, contact UI, schema.                              | backend-data + frontend-ui         | CSV tests, API tests, E2E import.           | Valid import creates contacts with consent status.        | CSV parser edge cases.              | Limit accepted format and document.             |
| 3: Provider adapter and webhooks  | Twilio/dummy provider, inbound/status webhooks.                         | Adapter, Twilio normalization, signature validation, idempotency.                                       | `lib/messaging/**`, `app/api/webhooks/**`, webhook tests.                             | backend-data                       | provider tests, webhook signature tests.    | Dummy works; Twilio webhook fixtures normalize.           | Signature URL mismatch.             | Add exact URL helper and tests.                 |
| 4: Queue/scheduling/send pipeline | BullMQ queues, campaign recipients, send preflight, worker.             | Campaign schedule, bulk jobs, message records.                                                          | `lib/queue/**`, `workers/**`, campaign APIs.                                          | backend-data                       | queue tests, idempotency tests.             | Demo scheduled campaign sends through dummy provider.     | Duplicate sends.                    | Enforce idempotency key unique.                 |
| 5: Main user workflows            | Campaign composer, inbox, assignments, notes, resolve.                  | UI flows and APIs.                                                                                      | `app/(dashboard)/campaigns/**`, `inbox/**`, components.                               | frontend-ui + backend-data         | Playwright demo flows.                      | User can compose, schedule, reply, assign, note, resolve. | API/UI mismatch.                    | Contract update, then UI repair.                |
| 6: Compliance gates and demo mode | Hard gates, STOP/HELP, audit, demo scenarios.                           | Compliance profile, gate tests, demo seed, go-live page.                                                | `lib/compliance/**`, `docs/COMPLIANCE.md`, demo fixtures, UI.                         | tests-quality + backend-data       | compliance, hard-gate, demo tests.          | Live send blocked unless all gates pass.                  | Gate bypass through alternate path. | Centralize send entrypoint.                     |
| 7: AI features                    | Campaign copy, reply suggestions, summaries, lead qualification.        | Fake AI provider, AI APIs, UI buttons/cards.                                                            | `lib/ai/**`, `app/api/ai/**`, AI UI.                                                  | integrations-ai + frontend-ui      | fake AI tests, E2E suggestion flow.         | AI outputs deterministic in demo.                         | Live AI cost/flakiness.             | Fake provider only until live flag.             |
| 8: Analytics and billing model    | Usage events, basic dashboard, billing records.                         | Analytics endpoint, charts, usage page.                                                                 | `lib/analytics/**`, `lib/billing/**`, UI.                                             | integrations-ai + frontend-ui      | usage tests, analytics tests.               | Campaign/message/AI usage visible.                        | Miscounting.                        | Use simple event counters.                      |
| 9: Demo polish                    | Investor-ready flow.                                                    | Guided demo page, clean seed, smoke path.                                                               | `docs/DEMO_MODE.md`, `e2e/demo-path.spec.ts`, demo UI.                                | tests-quality + frontend-ui        | Playwright full demo.                       | 10-minute demo works repeatedly.                          | Flaky E2E.                          | Freeze scenario and use deterministic fixtures. |
| 10: Hardening                     | Reduce regressions, finalize contracts, repair CI.                      | Risk register updated, tests expanded, merge playbook validated.                                        | All docs/tests/scripts.                                                               | orchestrator + tests-quality       | full validate, E2E, premerge.               | Green CI and local gate; next sprint ready.               | Contract drift.                     | Contract check and freeze.                      |

# 15. Testing Strategy

## Priority

Tests should prevent AI-agent regressions, especially:

1. Cross-tenant data leaks.
2. Accidental live sends.
3. Consent/opt-out failures.
4. Webhook forgery/duplicates.
5. Provider adapter drift.
6. Demo path breakage.
7. Queue duplicate sends.
8. AI nondeterminism and cost.
9. Billing live-charge mistakes.
10. Contract drift.

## Required Test Categories

| Category                   | Location                                   | Required assertions                                                                                            |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Unit tests                 | `tests/unit/**`                            | Validation schemas, template rendering, consent logic, opt-out keyword normalization, provider status mapping. |
| Contract tests             | `tests/contract/**`                        | API schemas exported, provider interface implemented by dummy/Twilio, DB tenant invariant names present.       |
| Webhook signature tests    | `tests/integration/webhooks/**`            | Valid Twilio signature accepted, invalid rejected, unknown fields preserved, duplicate ignored.                |
| Provider-adapter tests     | `tests/unit/provider/**`                   | Dummy provider deterministic; Twilio adapter maps inputs/statuses without live calls.                          |
| Queue tests                | `tests/unit/queue/**`                      | Job payload schema, idempotency key, retry state, cancellation behavior.                                       |
| Tenant-isolation tests     | `tests/integration/tenant-isolation/**`    | Foreign org IDs cannot access contacts, campaigns, messages, conversations, billing, AI runs.                  |
| Compliance behavior tests  | `tests/unit/compliance/**`                 | Opt-in required, STOP blocks, HELP does not opt in, audit logs written.                                        |
| Mocked AI tests            | `tests/unit/ai/**`                         | Fake provider returns deterministic copy/suggestions/summaries/qualification; live provider blocked in CI.     |
| Playwright demo-path tests | `e2e/demo-path.spec.ts`                    | Seed demo, import contacts, compose campaign, preflight, schedule, inbox reply, STOP/HELP, analytics.          |
| Seed-data tests            | `tests/integration/db/seed.test.ts`        | Demo seed creates expected objects and no real provider config.                                                |
| Hard-gate tests            | `tests/unit/compliance/hard-gates.test.ts` | Live external actions blocked without explicit flags and completed checklist.                                  |

## CI Test Tags [DEFAULT]

* `@smoke`: required for every PR.
* `@contract`: required for every PR.
* `@hard-gate`: required for every PR.
* `@slow`: nightly/manual only until stable.
* `@live-allowlist`: never runs in CI; only local explicit live test.

# 16. Risk Register

| Risk                           | Probability |   Impact | Mitigation                                                                  | Early warning sign                             |
| ------------------------------ | ----------: | -------: | --------------------------------------------------------------------------- | ---------------------------------------------- |
| AI-agent contract drift        |        High |     High | Contracts, Zod schemas, contract tests, docs-orchestrator merge first.      | Frontend mocks fields not in API.              |
| Broken demo path               |      Medium |     High | Deterministic seed, Playwright smoke, demo docs.                            | Demo E2E fails after unrelated change.         |
| Cost blowout                   |      Medium |     High | Dummy provider default, fake AI default, live flags, usage limits.          | CI or tests require real provider env.         |
| Secrets leakage                |      Medium | Critical | `.env.example` only, secrets scan, env safety script.                       | Secret-like string appears in commit diff.     |
| Multi-tenant data leak         |      Medium | Critical | `orgId` invariant, repository scoping, tenant tests.                        | API accepts foreign ID.                        |
| Destructive migration          |      Medium |     High | Migration safety script, no production reset, rollback tags.                | Agent runs reset without local flag.           |
| Webhook mismatch               |      Medium |     High | Twilio fixture tests, signature validation, raw payload storage.            | Webhook handler assumes fixed fields.          |
| Compliance failure             |      Medium | Critical | Hard gate tests, STOP/HELP tests, compliance checklist.                     | Campaign can send to opted-out contact.        |
| Provider outage                |      Medium |   Medium | Queue retry, provider status mapping, dummy provider for demo.              | Provider errors block UI rendering.            |
| Unbounded AI loop              |         Low |     High | Single-shot AI endpoints, token/usage caps, fake provider in demo/CI.       | AI job recursively enqueues AI job.            |
| Flaky E2E tests                |      Medium |   Medium | Stable seed, accessibility selectors, no arbitrary sleeps.                  | Playwright passes locally but fails CI.        |
| Twilio A2P requirements change |      Medium |     High | Verify Twilio docs at planning/go-live, store registration fields flexibly. | Registration rejection due missing field.      |
| Queue duplicate sends          |      Medium | Critical | Idempotency keys, unique DB constraints, queue tests.                       | Same contact receives duplicate dummy message. |
| Billing live-charge error      |         Low | Critical | No live Stripe mutation in MVP, `LIVE_BILLING_ENABLED` gate.                | Stripe API called in test/demo.                |
| Human bottleneck returns       |      Medium |   Medium | Auto-merge safe green PRs, clear work orders, no routine approvals.         | Agents ask repeated routine setup questions.   |

# 17. First 10 Coding Tasks

|  # | Task                                                                                                                               | Assigned role                    | Files/contracts                                                                                  | Acceptance criteria                                                | Validation command                           |
| -: | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
|  1 | Initialize Next.js TypeScript strict repo with Tailwind, shadcn/ui config placeholder, Vitest, Playwright, Prisma, Docker Compose. | repo-bootstrap                   | `package.json`, configs, `docker-compose.yml`                                                    | `npm install` succeeds; app builds minimal page.                   | `npm run build`                              |
|  2 | Create source-of-truth docs and contract stubs.                                                                                    | repo-bootstrap/docs-orchestrator | `README.md`, `PLAN.md`, `AGENTS.md`, `docs/**`, `contracts/**`                                   | All required docs/contracts exist with owner/update rules.         | `npm run contracts:check`                    |
|  3 | Add `.env.example` and env safety script.                                                                                          | repo-bootstrap/tests-quality     | `.env.example`, `scripts/check-env-safety.ts`                                                    | No real secrets; live flags default false; CI safety check passes. | `npm run secrets:scan`                       |
|  4 | Add one-command validation script.                                                                                                 | repo-bootstrap/tests-quality     | `scripts/validate.ts`, `docs/LOCAL_GATE.md`                                                      | Runs lint/typecheck/prisma/test/build/compliance where available.  | `npm run validate`                           |
|  5 | Create Prisma baseline schema for org/user/membership/contact/compliance/message/campaign/conversation.                            | backend-data                     | `prisma/schema.prisma`, `contracts/CONTRACT-DB.md`                                               | Schema validates; tenant-scoped models include `orgId`.            | `npm run db:generate && npm run db:validate` |
|  6 | Implement compliance gate library skeleton and tests.                                                                              | backend-data/tests-quality       | `lib/compliance/gates.ts`, `tests/unit/compliance/**`, `CONTRACT-COMPLIANCE.md`                  | Opt-out/missing consent/live disabled cases block sends.           | `npm run test -- compliance`                 |
|  7 | Implement provider adapter interface and dummy provider.                                                                           | backend-data                     | `lib/messaging/provider/**`, `CONTRACT-PROVIDER-ADAPTER.md`                                      | Dummy provider deterministic; no external calls.                   | `npm run test -- provider`                   |
|  8 | Add demo seed fixtures and seed script.                                                                                            | backend-data/tests-quality       | `prisma/seed.ts`, `prisma/fixtures/**`, `docs/DEMO_MODE.md`                                      | Demo org, contacts, campaigns, conversations seeded.               | `npm run demo:seed`                          |
|  9 | Add CI skeleton with live-action prevention.                                                                                       | repo-bootstrap/tests-quality     | `.github/workflows/ci.yml`, `scripts/assert-no-live-send-in-ci.ts`                               | CI sets demo-safe env and runs validation.                         | `npm run validate`                           |
| 10 | Add agent protocol files and first worktree scripts.                                                                               | docs-orchestrator                | `AGENTS.md`, `docs/WORKTREE_SETUP.md`, `scripts/create-worktrees.*`, `scripts/check-worktrees.*` | Worktree commands documented for PowerShell and bash.              | `npm run agent:status`                       |

# 18. First Repo Bootstrap Prompt

```text
You are the repo bootstrap coding agent for SignalStack SMS.

MISSION:
Complete Milestone 0 only for a new 100% AI-coded SMB texting SaaS repo.

DO NOT implement product features beyond minimal stubs required for the repo to validate.

PRODUCT:
AI-first SMB SMS/MMS SaaS with marketing campaigns, shared inbox, AI lead qualification, Twilio-first provider adapter, dummy demo provider, consent/compliance gates, and demo-safe defaults.

STACK DEFAULTS:
- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui-ready structure
- PostgreSQL
- Prisma
- Clerk-ready auth structure
- Stripe billing data model stubs only
- Twilio provider adapter stubs only
- BullMQ + Redis-ready queue structure
- Zod
- Vitest
- Playwright
- GitHub Actions
- Docker Compose for local Postgres/Redis
- .env.example with no real secrets

OPERATING POSTURE:
- Maximum automation.
- Least human bottlenecks.
- No human code review requirement for routine green changes.
- Preserve hard gates for live SMS, live billing, real secrets, destructive production DB operations, irreversible deletion, and compliance-sensitive behavior.
- Hard gates must be scripts/tests/feature flags, not vague prose.
- Use [DEFAULT] in docs for assumptions.

COMPLETE MILESTONE 0 ONLY:
1. Initialize the repo if not already initialized.
2. Create the exact high-level folder structure:
   - app/
   - components/
   - lib/
   - prisma/
   - workers/
   - scripts/
   - tests/
   - e2e/
   - docs/
   - contracts/
   - prompts/
   - .github/workflows/
   - .cursor/rules/
3. Create required source-of-truth docs:
   - README.md
   - PLAN.md
   - AGENTS.md
   - docs/PRODUCT_SPEC.md
   - docs/ARCHITECTURE.md
   - docs/DATA_MODEL.md
   - docs/API_MAP.md
   - docs/WEBHOOKS.md
   - docs/PROVIDER_ADAPTER.md
   - docs/COMPLIANCE.md
   - docs/TESTING.md
   - docs/AGENT_PROTOCOL.md
   - docs/DEMO_MODE.md
   - docs/RISK_REGISTER.md
   - docs/LOCAL_GATE.md
   - docs/MERGE_PLAYBOOK.md
   - docs/WORKTREE_SETUP.md
   - docs/NEXT_PROMPTS.md
4. Create required contract stubs:
   - contracts/CONTRACT-DB.md
   - contracts/CONTRACT-API.md
   - contracts/CONTRACT-WEBHOOKS.md
   - contracts/CONTRACT-PROVIDER-ADAPTER.md
   - contracts/CONTRACT-AI.md
   - contracts/CONTRACT-BILLING.md
   - contracts/CONTRACT-TESTING.md
   - contracts/CONTRACT-COMPLIANCE.md
   - contracts/CONTRACT-QUEUE.md
5. Add package scripts:
   - setup
   - dev
   - worker
   - build
   - typecheck
   - lint
   - test
   - test:e2e
   - test:e2e:smoke
   - db:generate
   - db:migrate
   - db:deploy
   - db:seed
   - db:reset
   - demo:seed
   - contracts:check
   - compliance:check
   - secrets:scan
   - validate
   - agent:status
   - agent:handoff
   - agent:repair
   - ci
   - premerge
6. Add .env.example with no real secrets and these demo-safe defaults:
   - DEMO_MODE=true
   - LIVE_MESSAGING_ENABLED=false
   - LIVE_BILLING_ENABLED=false
   - MESSAGING_PROVIDER=dummy
   - AI_PROVIDER=fake
7. Add CI skeleton:
   - lint
   - typecheck
   - Prisma validate
   - unit tests
   - Playwright smoke
   - build
   - env/secrets safety
   - no live SMS/billing in CI
8. Add demo/test-mode conventions:
   - dummy provider is default
   - fake AI is default
   - no live Twilio calls in tests/CI
   - no live Stripe calls in tests/CI
9. Add a minimal Prisma schema that validates.
10. Add minimal app/page/layout files so build can run.
11. Add minimal Vitest and Playwright smoke tests.
12. Add validation command that runs the available checks.
13. Run validation.
14. Fix errors you introduced.
15. Stop after Milestone 0 passes.

FILES TO CREATE OR MODIFY:
- Root config files
- docs/**
- contracts/**
- scripts/**
- .github/workflows/**
- app/** minimal stubs
- lib/** minimal stubs
- prisma/schema.prisma minimal stub
- tests/** minimal smoke tests
- e2e/** minimal smoke test
- SUMMARY.bootstrap.md
- BLOCKERS.bootstrap.md

FILES NEVER TO CREATE WITH REAL VALUES:
- .env.local with real secrets
- Twilio credentials
- Stripe credentials
- Clerk secrets
- live API keys

VALIDATION:
Run:
npm install
npm run validate

If Playwright browser install is required for smoke:
npx playwright install chromium
npm run test:e2e:smoke

SELF-DEBUG:
- If a script referenced by validate is missing, create the minimal script.
- If build fails because the app is incomplete, create minimal valid stubs.
- If Prisma fails, simplify schema until it validates.
- If lint/typecheck fail, repair your code.
- If a check cannot reasonably pass due environment, record exact command, error, and blocker in BLOCKERS.bootstrap.md.

STOP CONDITION:
Stop after Milestone 0 passes validation or after recording a precise environment blocker.

FINAL REPORT FORMAT:
Agent: repo-bootstrap
Branch:
Files created:
Files modified:
Commands run:
Validation result:
Known issues:
Exact next prompt:

The exact next prompt should dispatch the backend/data agent to implement Milestone 1 database/auth/org foundations using contracts/CONTRACT-DB.md, docs/DATA_MODEL.md, and AGENTS.md.
```

[1]: https://github.com/michaelcrosato/salesforce-lite-crm/commits/main/ "Commits · michaelcrosato/salesforce-lite-crm · GitHub"
[2]: https://github.com/michaelcrosato/salesforce-lite-crm/blob/main/README.md "salesforce-lite-crm/README.md at main · michaelcrosato/salesforce-lite-crm · GitHub"
[3]: https://github.com/michaelcrosato/salesforce-lite-crm/blob/main/docs/NEXT-PROMPTS.md "salesforce-lite-crm/docs/NEXT-PROMPTS.md at main · michaelcrosato/salesforce-lite-crm · GitHub"
[4]: https://github.com/michaelcrosato/salesforce-lite-crm/blob/main/CRM-CONTRACT.md "salesforce-lite-crm/CRM-CONTRACT.md at main · michaelcrosato/salesforce-lite-crm · GitHub"
[5]: https://github.com/michaelcrosato/salesforce-lite-crm/blob/main/PLAN.md "salesforce-lite-crm/PLAN.md at main · michaelcrosato/salesforce-lite-crm · GitHub"
[6]: https://github.com/michaelcrosato/salesforce-lite-crm/blob/main/docs/MERGE-PLAYBOOK.md "salesforce-lite-crm/docs/MERGE-PLAYBOOK.md at main · michaelcrosato/salesforce-lite-crm · GitHub"
[7]: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc "Programmable Messaging and A2P 10DLC | Twilio"
[8]: https://www.twilio.com/docs/usage/webhooks/webhooks-security "Webhooks security | Twilio"
[9]: https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and- "A2P 10DLC campaign registration will require privacy policy and terms & conditions URLs starting June 30, 2026 | Twilio"
