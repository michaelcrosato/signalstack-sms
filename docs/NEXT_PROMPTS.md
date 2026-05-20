# Next Prompts

## Current State

Completed through Milestone 7 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.
- Milestone 7: deterministic fake AI copy, reply suggestion, summary, and lead qualification APIs.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 8 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 8 analytics and billing model foundations from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/CONTRACT-BILLING.md
5. contracts/CONTRACT-API.md
6. contracts/CONTRACT-DB.md
7. docs/DATA_MODEL.md
8. docs/LOCAL_GATE.md

SCOPE:
- Usage event/billing-safe metering data model.
- Analytics overview endpoint for contacts, campaigns, conversations, messages, and usage.
- Billing usage endpoint that records/returns local usage metadata only.
- Tests proving no live billing or Stripe calls happen by default.

DO NOT:
- Create real Stripe customers, subscriptions, invoices, checkout sessions, or charges.
- Send live SMS, email, notifications, or provider calls.
- Add real API keys or paid services.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke E2E. Repair failures before committing.
```
