# Next Prompts

## Current Milestone 1 Continuation

Validate and extend the database/auth/organization foundation only:

- Keep `GET /api/orgs/current` contract-compliant.
- Add Clerk integration shims only if they preserve the deterministic demo fallback.
- Do not implement campaign, inbox, AI, billing, or live provider behavior yet.

## Next Milestone 2 Prompt

```text
You are the autonomous implementation agent for SignalStack SMS.

MISSION:
Implement Milestone 2 contacts and consent foundations from the repo-local doctrine.

READ FIRST:
1. AGENTS.md
2. docs/CANONICAL_IMPLEMENTATION_PLAN.md
3. PLAN.md
4. contracts/CONTRACT-DB.md
5. contracts/CONTRACT-API.md
6. contracts/CONTRACT-COMPLIANCE.md
7. docs/DATA_MODEL.md
8. docs/LOCAL_GATE.md

SCOPE:
- Contacts CRUD foundations.
- Consent status and opt-out fields.
- Tags/lists/segments schema foundations.
- CSV import parser and demo-safe import endpoint.
- Tenant-scoped repositories and tests.

DO NOT:
- Send live SMS.
- Add campaign send behavior.
- Add inbox behavior.
- Add live AI, billing, Stripe, Twilio, or notifications.

DEFAULTS:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

VALIDATION:
Run npm install, db generate/migrate, demo seed, typecheck, lint, test, build, and npm run validate. Start local Docker services if needed.
```
