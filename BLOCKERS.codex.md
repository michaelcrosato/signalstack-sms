# Codex Blockers

Run number: 23

No active blockers.

## Notes

- `/settings/data` is a read-only local data operations view. It displays tenant-scoped record totals, active and archived contact counts, import ledger row totals, retention signals, recent archived contact metadata, and safety boundaries; it does not hard-delete records, restore archived contacts, run exports, mutate data, call providers, create billing records, send notifications, call live AI, send SMS, expose secrets, or enable live features.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
