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
- The browser product now has an initial `/dashboard` shell, `/dashboard/contacts` list/import workflow with archived restore links, `/dashboard/contacts/:contactId` local detail/edit/archive/restore/merge workflow, `/dashboard/campaigns` compose/preflight/local schedule workflow, `/dashboard/campaigns/:campaignId` local draft edit and queued cancel workflow, `/dashboard/inbox` local thread workflow, `/dashboard/templates` local template create/list workflow, `/dashboard/templates/:templateId` local detail/edit workflow, `/dashboard/analytics` local overview detail, and `/dashboard/compliance` local readiness detail.
- The only live external-impact route is the isolated gated live-test SMS demo path.
- Local database and BullMQ workers now block every production-like runtime marker (`NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, and `APP_ENV`) even with dummy/demo-safe provider defaults.
- `docs/PRODUCTION_WORKER_POLICY.md` now defines the future production worker planning gate and `lib/queue/live-worker-controls.ts` pins the reserved `production-live-campaign` control checklist as frozen metadata with a supported status vocabulary, frozen data descriptor requirement, frozen plain supplied-control array requirement, enumerable indexed-data-slot exact-key-order evidence guard, ordinary-object entry requirement, own-enumerable-data-field public authorization guard, getter-safe identity/status checks, proxy-trap-safe malformed-evidence denial including frozen-state traps, unsupported/malformed-class control-evidence short-circuit coverage, exact-order frozen-data-field authorization-wrapper denial, extensible-wrapper denial, mutable/configurable wrapper-field denial, and nullish-control-evidence denial. Public worker readiness accepts runtime-unknown safety input and denies malformed deployment-class values before provider fallthrough. `npm run production-worker:check` keeps the current local/demo-only worker boundary present in docs/source/tests. `WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only; it does not authorize live worker execution.
- Live campaign sending, live billing, live AI, production auth, production secrets, and production deployment remain blocked.

## Next Best Work

1. Keep the product demo path stable while collecting review feedback.
2. Keep hardening the executable `production-live-campaign` controls before adding any supported live worker class or live-provider campaign sends.

## Guardrails

- Do not weaken live SMS, billing, AI, provider, secret, destructive database, compliance, spam, data leakage, or financial-cost gates.
- Do not expand read-only operations pages unless they directly support release safety or product work.
- Prefer existing APIs, validation helpers, tenant helpers, and tests.
- Keep `npm run validate` green before handoff.
