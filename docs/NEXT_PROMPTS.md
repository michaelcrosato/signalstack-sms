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
- The browser product now has an initial `/dashboard` shell, `/dashboard/contacts` list/import workflow with archived restore links, `/dashboard/contacts/:contactId` local detail/edit/archive/restore/merge workflow, `/dashboard/campaigns` compose/preflight/local schedule workflow, `/dashboard/campaigns/:campaignId` local draft edit and queued cancel workflow, `/dashboard/inbox` local thread workflow, `/dashboard/templates` local template create/list workflow, `/dashboard/analytics` local overview detail, and `/dashboard/compliance` local readiness detail.
- The only live external-impact route is the isolated gated live-test SMS demo path.
- Local database and BullMQ workers now block production-like runtime markers even with dummy/demo-safe provider defaults.
- Live campaign sending, live billing, live AI, production auth, production secrets, and production deployment remain blocked.

## Next Best Work

1. Add separate template detail/edit only if needed after product demo review.
2. Start live-provider design only after a separate production worker policy is specified.

## Guardrails

- Do not weaken live SMS, billing, AI, provider, secret, destructive database, compliance, spam, data leakage, or financial-cost gates.
- Do not expand read-only operations pages unless they directly support release safety or product work.
- Prefer existing APIs, validation helpers, tenant helpers, and tests.
- Keep `npm run validate` green before handoff.
