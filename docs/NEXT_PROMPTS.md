# Next Prompts

## Current State

Completed through Milestone 5 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 6 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 6 compliance gates and demo mode expansion from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/CONTRACT-COMPLIANCE.md
5. contracts/CONTRACT-PROVIDER-ADAPTER.md
6. contracts/CONTRACT-API.md
7. docs/COMPLIANCE.md
8. docs/DEMO_MODE.md
9. docs/LOCAL_GATE.md

SCOPE:
- Centralized send/provider hard gates before any external messaging behavior.
- Compliance checklist/profile foundations for demo go-live readiness.
- Expanded demo scenarios for inbox STOP/HELP and compliance-blocked sends.
- Tests proving live messaging remains disabled by default and alternate paths cannot bypass gates.

DO NOT:
- Send live SMS.
- Send live email or notifications.
- Add real Twilio sends without hard signature/config/live gates.
- Add live AI, billing, Stripe, or real provider calls.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke E2E. Repair failures before committing.
```
