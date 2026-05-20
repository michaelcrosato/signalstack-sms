# Codex Summary

Run number: 14

## Completed

- Advanced a post-MVP local usage and analytics admin-view checkpoint.
- Added `/settings/usage`, a read-only page that renders tenant-scoped contact, campaign, conversation, message, local usage totals, billing boundary status, and recent usage events.
- Linked the usage view from `/demo`, `/settings`, `/settings/system`, and `/settings/exports`.
- Kept the page display-only: it does not mutate records, call Stripe, create billing provider artifacts, expose secrets, call providers, send notifications, or enable live messaging.
- Extended the seeded investor demo E2E to verify the usage page.
- Updated API, billing, and testing contracts plus API map, demo-mode docs, local operator runbook, README, PLAN, and next prompt handoff docs.

## Validation

- `npm run typecheck`
- `npm run contracts:check`
- `npm run lint`
- `npm run db:generate`
- `npm run test`
- `npm run build`
- `$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run db:migrate`
- `npm run validate`
- `$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run demo:seed`
- `$env:DATABASE_URL='postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public'; npm run test:e2e:demo`

Latest full validation and seeded demo E2E passed.
