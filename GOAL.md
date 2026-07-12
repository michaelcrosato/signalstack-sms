# GOAL

## Purpose

SignalStack SMS is a self-hostable, multi-tenant SMS/MMS platform for companies that need contacts,
audiences, campaigns, transactional messaging, a shared inbox, compliance controls, analytics, and a
stable integration API. The complete product must run from one supported package on infrastructure the
operator controls.

The only unavoidable external boundary is access to the mobile carrier network through Twilio, another
CPaaS, or a direct carrier/SMSC connection. Clerk, Stripe, Vercel, Redis, hosted AI, hosted email,
hosted monitoring, and hosted object storage must not be core requirements.

The detailed product contract, milestone graph, acceptance matrix, and verification ledger are in
`docs/STANDALONE_ROADMAP.md`.

## Current state (2026-07-10)

- Strong demo-safe foundations: tenant-scoped repositories, contacts/imports, templates, campaigns,
  durable database queue jobs, optional BullMQ mirroring, shared inbox, compliance gates, dummy provider,
  fake/local AI, Twilio webhook parsing, provider metadata, observability seams, and product UI.
- The seeded browser product path works at `/dashboard`; current database evidence is 37 PostgreSQL
  files / 186 passing tests, including the mandatory eight-file / 33-test tenant gate and nine-file /
  38-test auth database run. Playwright smoke, a production local-auth browser proof under a non-owner
  login, and the production build are green.
- M1 built-in identity is complete: local credentials, keyed opaque sessions, onboarding/team lifecycle,
  operator recovery, and fail-closed authorization replace deterministic identity outside explicit demo.
- M2 database-enforced tenant integrity is complete: all 40 migrations install under a non-superuser,
  non-BYPASSRLS table owner; same-tenant constraints, 27-table fail-closed RLS with semantic policy
  attestation, separate non-owner web/worker capabilities, exact control policies, short
  tenant/control/dispatch transactions, and mandatory two-tenant missing-context/forgery/pool proof are
  enforced.
- The repository is not yet a production SMS platform. Twilio callbacks still route to the demo tenant;
  provider secrets are not stored for real sends; the campaign
  worker is dummy-only and production-blocked; there is no public API-key surface, outbound customer
  webhook delivery, production container bundle, or backup/restore proof.
- Live SMS, billing, and hosted AI remain off by default. The isolated operator-gated live-test SMS path
  is not evidence of production campaign readiness.

## Desired end state

A company can install SignalStack on a clean host, bootstrap an owner, create and administer an
organization, connect an owned provider account/number, import and segment contacts, prove consent,
send and receive direct or campaign SMS/MMS, work replies in a team inbox, integrate its own software
through `/api/v1` and signed event webhooks, monitor the system, and restore or upgrade it without using
another application SaaS beyond carrier connectivity.

Feature completion requires every row in the acceptance matrix and every milestone in the verification
ledger in `docs/STANDALONE_ROADMAP.md` to be backed by current tests or deployment evidence.

## Non-goals

- Operating a mobile carrier network or pretending carrier/number/A2P relationships can be embedded.
- Live sends, paid provider calls, billing charges, or hosted-AI calls in defaults, tests, or CI.
- Voice, WhatsApp, or full CRM replacement before the SMS/MMS platform is complete.
- Treating an administrator toggle or a narrow mocked test as proof of legal or production readiness.
- Low-value syntactic test permutations that do not improve a real trust, recovery, or product boundary.

## Constraints

- Package manager: npm. Node 22+; TypeScript strict; Next.js App Router.
- PostgreSQL is the authoritative database and default durable queue. Redis is optional acceleration.
- Every tenant row/query/relation carries `orgId`; fail-closed RLS and same-tenant database constraints
  enforce that boundary independently of repository filters.
- Zod validates API, webhook, queue, import, provider, and configuration boundaries.
- Secrets never enter Git, images, logs, API responses, or browser state.
- Default provider is `dummy`; carrier calls require explicit, evidence-backed activation.
- Protected axioms and integrity-gate files remain human-owned.

## Known limitations

Gaps that survive the current state — deployment-dependent latent bugs, human-gated webhook/live paths,
and minor correctness rough edges — are recorded honestly in
[`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md). None block the demo-safe product.

## Agent guidance

- Read `docs/STANDALONE_ROADMAP.md`, this file, `docs/CURRENT_STATE_MATRIX.md`, and
  `docs/ai/REPO_MAP.md` before selecting work.
- Follow the dependency order in the standalone roadmap. Do not substitute demo polish for a missing
  production trust boundary.
- Contracts before behavior; targeted checks before the full protected gate; current evidence before
  status claims.

## Definition of done (per change)

- The change advances a named standalone milestone and updates its evidence truthfully.
- Tenant, idempotency, external-impact, secret, compliance, and recovery invariants are preserved.
- Targeted tests pass, then `npm run validate` is attempted; failures are explained and not relabeled.
- Docs/contracts/migrations/operator steps are updated with the implementation.
- No secret exposure, unapproved external send, destructive production action, or hard-gate bypass.

## Definition of product complete

- Every required standalone milestone is `done` with authoritative evidence.
- Clean-host install, authenticated setup, public API integration, direct send, inbound reply, STOP
  suppression, campaign execution, status/customer callbacks, restart recovery, backup restore, and
  upgrade/rollback drills pass.
- The only required external service is the configured carrier/network connection.
