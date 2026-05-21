# Codex Blockers

Run number: 29

No active blockers.

## Notes

- `/settings/runbook` now links the current local admin surfaces, including queue operations, delivery operations, readiness audit, provider numbers, API operations, security operations, notifications, and provider details. It remains read-only and does not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.
- `/settings/delivery` is a read-only local delivery operations view. It displays tenant-scoped message direction counts, delivery metadata, provider status labels, provider message ID presence, campaign/conversation context, recent idempotency keys, and safety boundaries; it does not send SMS, retry deliveries, replay webhooks, mutate messages, call providers, create billing records, send notifications, expose secrets, or enable live messaging.
- `/settings/readiness-audit` is a read-only local readiness audit operations view. It displays tenant-scoped local audit events, action/subject filters, local metadata, actor IDs, timestamps, and bounded CSV export links; it does not mutate audit events, expose secrets, call providers, create billing records, call live AI, send notifications, SMS, email, or enable live features.
- `/settings/api` includes static inventory rows for all currently implemented local API methods: contact soft archive, campaign draft update, inbox message reads, inbox note reads, and billing usage reads.
- The API operations unit test fixes the expected inventory count at 47 route-method entries and keeps external-impact routes at zero.
- `/settings/contracts` is a read-only local contract operations view. It displays static local contract inventory, drift controls, validation command references, and safety-boundary text; it does not read contract file contents, execute checks, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.
- `/settings/validation` is a read-only local validation operations view. It displays static local gate inventory, repair signals, and validation safety-boundary text; it does not execute commands, inspect logs, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
