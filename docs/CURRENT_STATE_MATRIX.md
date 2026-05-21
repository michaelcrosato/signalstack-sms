# Current State Matrix

Last updated: 2026-05-21.

This document is the quick reality check for planning. It complements `PLAN.md` and does not replace `docs/CANONICAL_IMPLEMENTATION_PLAN.md`.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Contacts | Tenant-scoped contacts, consent fields, CSV import, tags/lists/segments foundations. | Product dashboard summary, `/dashboard/contacts` list/import workspace, read-only operations views, and demo path coverage. | No product contact detail/edit workflow. | Add contact detail/edit after campaigns/inbox basics. |
| Campaigns | Drafts, recipients, preflight, schedule/cancel records, queue jobs, dummy worker path. | Product dashboard summary plus mostly read-only operations views and demo console. | No product campaign composer or owner-friendly schedule flow. | Build composer, recipient selection, preflight, schedule, and status UI. |
| Inbox | Conversations, messages, assignment, notes, resolve/reopen, demo inbound, STOP/HELP parsing. | Product dashboard summary plus read-only inbox operations view. | No product thread UI for operators. | Build inbox list/thread/reply-demo UI. |
| Templates | Template model and APIs exist. | Product dashboard summary plus read-only template operations view. | No product template management surface. | Build template list/detail/create/edit flow after contacts/campaigns. |
| Compliance | Profile/checklist APIs, readiness audit, opt-out foundations, central messaging gates. | Compliance and readiness audit operations pages. | A2P, quiet-hours, consent evidence, and live-send policy still need production implementation. | Keep live campaign sends blocked; add product-facing compliance readiness summary. |
| Twilio/Provider | Webhook foundations, status updates, provider metadata, credential readiness, gated live-test SMS. | Provider operations page plus `/demo` live-test SMS. | Full live campaign sending is intentionally not enabled. | Keep isolated test SMS; later harden Twilio adapter behind explicit gates. |
| AI | Deterministic fake provider and local AI endpoints. | AI operations page. | No live AI provider, cost controls, or product AI UX. | Keep fake AI for demo; defer live AI until product UI and cost gates exist. |
| Billing | Local usage events, billing account data, usage APIs. | Billing/usage operations pages. | No Stripe, payment collection, invoices, or subscription lifecycle. | Defer until Phase 3 behind live billing gates. |
| Auth/RBAC | Demo current user, role helpers, tenant helpers, mutating-route role enforcement. | Demo-safe single-user experience. | No production auth provider. | Add real auth/RBAC after product flow stabilizes. |
| Queue/Worker | Durable jobs, tenant-scoped idempotency, dummy worker with send-time consent rechecks, optional BullMQ/Redis mirror and worker. | Queue operations page. | Production worker policy still needs hardening before live sends. | Keep live sends blocked; harden production worker policy when live provider work starts. |
| Rate Limiting | Local in-memory API middleware. | Visible in operations status. | Not production-distributed. | Move to Redis or platform-backed limiter when production infrastructure is configured. |
| Operations Surfaces | Extensive inventory-backed read-only pages and tests. | Many `/settings/**` pages. | Operations UI has outgrown product UI. | Stop expanding operations pages unless they support release safety. |
| Tests/Gates | `npm run validate`, unit tests, Playwright smoke/demo/product-demo, contract/secret/compliance/production gates. | Browser smoke, seeded investor demo path, and seeded product dashboard plus contacts import path. | Campaign, inbox, and template product flows still need UI coverage as they are built. | Expand product E2E with campaigns, inbox, and templates workflows. |
| Docs/Planning | Canonical plan, contracts, local gate docs, large historical run logs, new model planning captures. | N/A | Plan needs to stay short enough to guide new agents. | Keep `PLAN.md`, this matrix, and `planning/CONSENSUS-2026-05-21.md` concise. |
