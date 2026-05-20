# Next Prompts

## Current State

Completed through Milestone 8 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.
- Milestone 7: deterministic fake AI copy, reply suggestion, summary, and lead qualification APIs.
- Milestone 8: local usage/billing records, analytics overview, and billing usage APIs.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 9 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 9 demo polish and investor demo path from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. PLAN.md
3. docs/CANONICAL_IMPLEMENTATION_PLAN.md
4. docs/DEMO_MODE.md
5. docs/API_MAP.md
6. contracts/CONTRACT-API.md
7. docs/LOCAL_GATE.md

SCOPE:
- Investor-demo page or route showing the seeded end-to-end flow.
- Deterministic Playwright demo path for import, preflight/schedule, inbound STOP/HELP, fake AI, analytics, and usage.
- Demo docs updated with exact flow.
- Keep UI simple but usable; avoid live providers and live billing.

DO NOT:
- Send live SMS.
- Send live email or notifications.
- Create real billing/Stripe artifacts.
- Call live AI providers.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke E2E. Repair failures before committing.
```
