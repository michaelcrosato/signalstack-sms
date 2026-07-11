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
| M2 | Database-enforced tenant integrity | partial foundation |
| M3 | Public API identity and customer webhooks | not started |
| M4 | Provider secrets, accounts, and owned-number routing | partial foundation |
| M5 | Durable direct-message outbox and Twilio transport | partial foundation |
| M6 | Trusted inbound messaging and shared inbox | partial foundation |
| M7 | Production campaigns and audience management | partial foundation |
| M8 | Compliance, audit, and data lifecycle | partial foundation |
| M9 | Product and administration completeness | partial foundation |
| M10 | Self-contained production package and operations | not started |
| M11 | Full release proof | not started |

M1 and M2 establish trust. M3 and M4 may then proceed in parallel. Live provider work starts only
after provider ownership, secrets, tenant routing, and durable-before-external semantics exist.

## Immediate execution queue

1. Implement M2: composite tenant constraints, fail-closed non-owner RLS, and mandatory two-tenant
   Postgres tests.
2. Build M3 API credentials + `/api/v1` + customer webhook outbox and M4 encrypted provider ownership
   control plane.
3. Continue through M5–M11 without narrowing the completion definition.

## Rules

- PostgreSQL is authoritative; Redis is optional.
- Built-in auth is the default; OIDC is optional. Clerk is not required.
- Local plans and quotas are built in; Stripe is optional.
- Fake/local AI is sufficient for core operation; hosted AI is optional.
- Demo defaults never send, charge, or call paid services.
- A roadmap status changes only when its stated exit proof has run against current code.
- Legal/compliance controls are configurable engineering safeguards, not a substitute for counsel or
  provider registration.
