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
| M5 | Durable direct-message outbox and Twilio transport | partial foundation |
| M6 | Trusted inbound messaging and shared inbox | partial foundation |
| M7 | Production campaigns and audience management | partial foundation |
| M8 | Compliance, audit, and data lifecycle | partial foundation |
| M9 | Product and administration completeness | partial foundation |
| M10 | Self-contained production package and operations | not started |
| M11 | Full release proof | not started |

M1 through M3 establish identity, tenant, and integration trust and are complete. M2 closed with a
least-privileged 40-migration install,
database-enforced tenant relations, forced RLS with semantic policy attestation, and exact runtime/control/
dispatch capabilities. M3 extended that boundary to its 43-migration/36-protected-table checkpoint and added
scoped `/api/v1` identity plus durable signed customer events without live carrier impact. M4 now extends the
current substrate to 51 migrations/39 protected tables with encrypted provider credentials, verified
account/number/service ownership, safe ADMIN lifecycle, and trusted callback routing. General live provider
mutation still waits for M5's durable-before-external semantics.

## Immediate execution queue

1. Build the M5 durable direct-message outbox and Twilio transport without weakening the completed M4 trust boundary.
2. Continue through M6–M11 without narrowing the completion definition.

## Rules

- PostgreSQL is authoritative; Redis is optional.
- Built-in auth is the default; OIDC is optional. Clerk is not required.
- Local plans and quotas are built in; Stripe is optional.
- Fake/local AI is sufficient for core operation; hosted AI is optional.
- Demo defaults never send, charge, or call paid services.
- A roadmap status changes only when its stated exit proof has run against current code.
- Legal/compliance controls are configurable engineering safeguards, not a substitute for counsel or
  provider registration.
