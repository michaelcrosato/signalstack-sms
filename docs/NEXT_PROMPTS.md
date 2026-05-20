# Next Prompts

## Current State

Completed through Milestone 10 hardening:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.
- Milestone 7: deterministic fake AI copy, reply suggestion, summary, and lead qualification APIs.
- Milestone 8: local usage/billing records, analytics overview, and billing usage APIs.
- Milestone 9: `/demo` investor console and deterministic Playwright demo path.
- Milestone 10: contract drift gate for API docs, tenant `orgId` invariant check, named seeded demo E2E script, and testing/local-gate doc updates.
- Post-MVP webhook foundation: Twilio inbound/status route foundations, signature validation helper, raw webhook event persistence, and webhook unit tests.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Post-MVP Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Continue from the post-MVP backlog after Milestone 10 hardening.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/**
5. docs/**
6. SUMMARY*.md
7. BLOCKERS*.md
8. docs/LOCAL_GATE.md

SCOPE:
- Preserve all Milestone 0-10 gates and demo-safe defaults.
- Implement the next post-MVP slice only when contracts/docs are updated first.
- Good candidate slices: UI expansion, worker execution, provider settings, status transition processing, or production deployment gates.
- Keep live SMS, live billing, real notifications, live AI, and real provider calls blocked unless explicit future hard gates are implemented and tested.
- Run the full local gate and seeded demo path before committing.

DO NOT:
- Send live SMS, email, notifications, or billing events.
- Call live AI or provider APIs.
- Add real secrets or production-destructive operations.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and `npm run test:e2e:demo` as appropriate. Repair failures before committing.
```
