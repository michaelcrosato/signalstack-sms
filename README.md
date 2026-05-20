# SignalStack SMS

SignalStack SMS is a 100% AI-coded SMB SMS/MMS SaaS repo. The current implementation is demo-safe through Milestone 9 foundations: contacts, consent, CSV import, campaigns, preflight/scheduling records, shared inbox, compliance gates, fake AI, local analytics/billing records, and an investor demo path.

## Demo-safe defaults

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Local validation

```bash
npm install
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

Investor demo path:

```bash
npm run test:e2e -- e2e/demo-path.spec.ts --project=chromium
```

All flows remain local/demo-only unless future hard gates explicitly enable live providers.

Production-like demo deployment is documented in `docs/PRODUCTION_GO_LIVE.md`. The current gate permits demo-safe production deployments only and keeps live SMS, billing, provider calls, and live AI blocked by default.

Deployment platform notes are documented in `docs/DEPLOYMENT_PLATFORM_NOTES.md`; `npm run platform:check` verifies that demo-safe hosting boundaries remain documented and is included in `npm run validate`.

Production observability planning is documented in `docs/PRODUCTION_OBSERVABILITY.md`. Current observability guidance is local/platform-only and does not add third-party telemetry, notifications, live providers, or billing side effects.

Local usage and analytics review is available at `/settings/usage`. It renders existing tenant-scoped metrics and usage events only; it does not call Stripe, create billing provider artifacts, call providers, send notifications, or enable live messaging.

Campaign operations review is available at `/settings/campaigns`. It renders existing campaign status, recipient counts, queue job state, and worker boundaries only; it does not schedule campaigns, run workers, mutate queue rows, call providers, bill, notify, send SMS, or enable live messaging.

Contact operations review is available at `/settings/contacts`. It renders existing consent status, CSV import state, tag counts, list counts, and recent contact metadata only; it does not import contacts, update consent, mutate labels, call providers, bill, notify, send SMS, or enable live messaging.

Audience operations review is available at `/settings/audience`. It renders existing tags, lists, saved segment definitions, and segment timestamps only; it does not change memberships, evaluate segments for sends, call providers, bill, notify, send SMS, or enable live messaging.

Template operations review is available at `/settings/templates`. It renders existing message template variables, campaign usage, and text previews only; it does not create templates, edit copy, render live outbound messages, schedule campaigns, call providers, bill, notify, send SMS, or enable live messaging.

Inbox operations review is available at `/settings/inbox`. It renders existing conversation status, assignment counts, recent message metadata, and shared inbox boundaries only; it does not create messages, assign or resolve conversations, mutate contacts, call providers, bill, notify, send SMS, or enable live messaging.

Team operations review is available at `/settings/team`. It renders existing organization metadata, membership role/status counts, assigned conversation counts, authored note counts, and member metadata only; it does not invite users, change roles, suspend members, delete memberships, call Clerk, email, notify, call providers, bill, send SMS, or enable live messaging.

Compliance readiness detail is available at `/settings/compliance`. It renders existing profile fields, checklist status, A2P metadata status, and live-message blockers only; it does not update records, verify provider registration, call providers, or enable live messaging.

Provider number metadata is available at `/settings/numbers`. It renders existing local number rows only; it does not provision numbers, verify provider ownership, call Twilio, mutate records, or enable live messaging.

The root route `/` is a local launch dashboard with demo-safe defaults and links to the seeded demo, go-live readiness, provider metadata, system status, usage, and admin export views.

Local operator procedures are documented in `docs/LOCAL_OPERATOR_RUNBOOK.md`; `npm run operator:check` verifies the runbook and is included in `npm run validate`.

The same local-only operator checklist is visible at `/settings/runbook`. It displays commands and safety boundaries only; it does not execute commands or create side effects.

The read-only `/settings/system` page summarizes local safety defaults, runtime markers, queue backend metadata, worker limits, and API rate-limit policy without mutations or external side effects.
