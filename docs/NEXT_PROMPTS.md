# Next Prompts

## Current State

Completed through Milestone 9 foundations:

- Milestone 1: org/auth foundation and `GET /api/orgs/current`.
- Milestone 2: contacts, consent fields, tags/lists/segments schema, CSV import API.
- Milestone 3: templates, draft campaigns, campaign recipients, preflight API.
- Milestone 4: durable queue job records plus schedule/cancel APIs.
- Milestone 5: shared inbox conversation/message APIs, assignment, notes, resolve/reopen, demo inbound creation, and STOP/HELP local parsing.
- Milestone 6: compliance profile/checklist API and centralized messaging hard gates.
- Milestone 7: deterministic fake AI copy, reply suggestion, summary, and lead qualification APIs.
- Milestone 8: local usage/billing records, analytics overview, and billing usage APIs.
- Milestone 9: `/demo` investor console and deterministic Playwright demo path.

Demo-safe defaults remain mandatory:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Next Milestone 10 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 10 hardening from the repo-local doctrine.

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
- Review contracts/docs/API map for drift and repair.
- Expand focused tests for tenant isolation, hard gates, local-only billing, fake AI, and demo path stability where feasible.
- Consider adding the demo path to the standard local gate only if it remains deterministic in CI.
- Repair any validation, migration, seed, or CI drift.
- Update SUMMARY/BLOCKERS with exact residual risk.

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
Run db generate/migrate, demo seed, typecheck, lint, test, build, npm run validate, and smoke/demo E2E as appropriate. Repair failures before committing.
```
