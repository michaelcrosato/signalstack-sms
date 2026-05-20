# Next Prompts

## Current State

Completed through Milestone 4 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 5 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 5 shared inbox workflow foundations from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/CONTRACT-DB.md
5. contracts/CONTRACT-API.md
6. contracts/CONTRACT-COMPLIANCE.md
7. docs/DATA_MODEL.md
8. docs/LOCAL_GATE.md

SCOPE:
- Conversation/message inbox APIs.
- Conversation assignment, internal notes, and resolve/reopen foundations.
- Demo-safe inbound message creation.
- STOP/HELP parsing foundations that update consent locally only.
- Tenant-scoped repositories and tests.

DO NOT:
- Send live SMS.
- Send live email or notifications.
- Add live Twilio webhook behavior without hard signature gates.
- Add live AI, billing, Stripe, or provider sends.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke E2E. Repair failures before committing.
```
