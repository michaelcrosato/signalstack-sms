# Codex Blockers

Run number: 24

No active blockers.

## Notes

- `/settings/queue` is a read-only local queue operations view. It displays tenant-scoped scheduled-campaign queue job counts, due/future timing, payload validity, worker settings, queue backend metadata, Redis presence, related campaign names, idempotency keys, and safety boundaries; it does not enqueue jobs, run workers, mutate queue rows, update campaigns, call Redis, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
