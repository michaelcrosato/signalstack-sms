# Next Prompts

## Current State

Completed through Milestone 6 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 7 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 7 AI feature foundations from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. contracts/CONTRACT-AI.md
5. contracts/CONTRACT-API.md
6. docs/DEMO_MODE.md
7. docs/LOCAL_GATE.md

SCOPE:
- Deterministic fake AI adapter foundations.
- AI campaign copy endpoint.
- AI reply suggestion endpoint.
- AI conversation summary endpoint.
- AI lead qualification endpoint.
- Tests proving fake AI outputs are deterministic and no live AI provider/cost is used by default.

DO NOT:
- Call live AI APIs.
- Add real API keys or paid provider calls.
- Send live SMS, email, notifications, or billing events.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke E2E. Repair failures before committing.
```
