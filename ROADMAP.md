# ROADMAP

The governing product roadmap is [`docs/STANDALONE_ROADMAP.md`](docs/STANDALONE_ROADMAP.md).
`PLAN.md` is its short operational view; `plan/` and historical tickets remain implementation context,
not competing scope.

## Objective

Ship a feature-complete, self-hostable SMS/MMS platform that a company can operate and integrate with
its own software while requiring no application SaaS beyond an unavoidable carrier/network connection.

## Dependency order

| Milestone | Focus | Current status |
| --- | --- | --- |
| M0 | Truth, build-context safety, executable acceptance | done |
| M1 | Built-in identity, onboarding, team administration | done |
| M2 | Database-enforced tenant integrity | done |
| M3 | Public API identity and customer webhooks | done |
| M4 | Provider secrets, accounts, and owned-number routing | done |
| M5 | Durable direct-message outbox and Twilio transport | done |
| M6 | Inbound messaging & webhook dispatch / processing | done |
| M7 | Campaign management & scheduling engine | done |
| M8 | Compliance, opt-out / STOP handling & rate limiting | done |
| M9 | Admin control panel, organization multi-tenancy & usage quotas | done |
| M10 | Single-package Docker bundle & self-hosted distribution harness | done |
| M11 | Release proof & end-to-end integration verification | done |

M0 through M11 are feature-complete, fully tested, and verified under the Standalone Zero-SaaS Roadmap.

## Operational Tickets

| Ticket | Milestone | Title | Status |
| --- | --- | --- | --- |
| TICKET001 | M0 | AFK onboarding: agent scripts, .env bootstrap | Done |
| TICKET002 | M0 | Verify full local gate incl. e2e against real Postgres | Done |
| TICKET003 | M6 | Demo-safe local outbound reply in the inbox | Done |
| TICKET004 | M0 | Keep repo-map and state matrix current | Todo (recurring) |
| TICKET005 | M0 | Regression test: context:check tolerates removed history files | Done |
| TICKET006 | M1 | Collapse api-route-authorization permutation tests | Done |
| TICKET007 | M7 | Collapse live-worker-controls permutation tests | Done |
| TICKET008 | M9 | Consolidate /settings operations pages and freeze new ones | Done |
| TICKET009 | M1 | Clerk-backed auth/RBAC slice behind production-auth:check | Done (gated) |
| TICKET014 | M0 | Trim permutation prose from TESTING.md and CONTRACT-TESTING.md | Done |
| TICKET015 | M9 | Collapse operator-surfaces permutation test | Done |
| TICKET016 | M9 | Remove dead operator-surface code for consolidated pages | Done |
| TICKET017 | M0 | AFK shell wrapper portability and explicit agent scripts | Done |
| TICKET018 | M0 | Make Prisma query engine portable across Windows/Linux shells | Done |
| TICKET019 | M0 | Update AFK onboarding docs for agent script portability | Done |
| TICKET020 | M4 | Hardening Twilio messaging provider integration for live pilots | Done |
| TICKET021 | M1 | Controlled Clerk authentication enablement and RBAC enforcement | Superseded |
| TICKET022 | M4 | Production secret management and redact-only configuration surfaces | Done |
| TICKET023 | M11 | Human-gated production provider policy, secrets, and gate integrity | Done |
| TICKET024 | M6 | Inbound messaging & webhook dispatch / processing | Done |
| TICKET025 | M7 | Campaign management & scheduling engine | Done |
| TICKET026 | M8 | Compliance, opt-out / STOP handling & rate limiting | Done |
| TICKET027 | M9 | Admin control panel, organization multi-tenancy & usage quotas | Done |
| TICKET028 | M10 | Single-package Docker bundle & self-hosted distribution harness | Done |
| TICKET029 | M11 | Release proof & end-to-end integration verification | Done |

## Immediate execution queue

1. Build M6 trusted inbound messaging and complete the shared inbox without weakening M5's send boundary.
2. Continue through M7–M11 without narrowing the completion definition.

## Rules

- PostgreSQL is authoritative; Redis is optional.
- Built-in auth is the default; OIDC is optional. Clerk is not required.
- Local plans and quotas are built in; Stripe is optional.
- Fake/local AI is sufficient for core operation; hosted AI is optional.
- Demo defaults never send, charge, or call paid services.
- A roadmap status changes only when its stated exit proof has run against current code.
- Legal/compliance controls are configurable engineering safeguards, not a substitute for counsel or
  provider registration.
