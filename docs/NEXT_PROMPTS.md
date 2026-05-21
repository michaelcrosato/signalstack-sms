# Next Prompts

This file is the handoff for the next automated loop. It should stay short enough that a new agent can understand the next work quickly.

## Read First

1. `docs/CANONICAL_IMPLEMENTATION_PLAN.md`
2. `PLAN.md`
3. `docs/CURRENT_STATE_MATRIX.md`
4. `planning/CONSENSUS-2026-05-21.md`
5. `AGENTS.md`
6. `contracts/**`
7. `docs/LOCAL_GATE.md`

## Current State

- The backend foundation is strong: tenant helpers, contacts, campaigns, queue jobs, inbox, compliance gates, fake AI, local billing/analytics, provider metadata, Twilio webhook foundations, readiness audit, operations inventory, and validation gates.
- The browser product is weak: most pages are read-only `/settings/**` operations surfaces, not a polished owner/operator workflow.
- The only live external-impact route is the isolated gated live-test SMS demo path.
- Live campaign sending, live billing, live AI, production auth, production secrets, and production deployment remain blocked.

## Next Best Work

1. Build the `/dashboard` product shell with primary navigation for contacts, campaigns, inbox, templates, analytics, compliance, and settings.
2. Add a product-demo Playwright path that a non-technical investor can follow.
3. Build contacts list/import UI on the existing contacts/import APIs.
4. Build campaign composer, preflight, schedule, and status UI on existing campaign APIs.
5. Build inbox list/thread UI on existing inbox APIs.
6. Fix mutating-route RBAC enforcement.
7. Add product-facing compliance readiness summary.
8. Harden production worker policy before broader live sending.

## Guardrails

- Do not weaken live SMS, billing, AI, provider, secret, destructive database, compliance, spam, data leakage, or financial-cost gates.
- Do not expand read-only operations pages unless they directly support release safety or product work.
- Prefer existing APIs, validation helpers, tenant helpers, and tests.
- Keep `npm run validate` green before handoff.
