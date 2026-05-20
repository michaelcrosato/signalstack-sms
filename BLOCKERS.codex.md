# Codex Blockers

Run number: 25

No active blockers.

## Notes

- `/settings/contracts` is a read-only local contract operations view. It displays static local contract inventory, drift controls, validation command references, and safety-boundary text; it does not read contract file contents, execute checks, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.
- `/settings/validation` is a read-only local validation operations view. It displays static local gate inventory, repair signals, and validation safety-boundary text; it does not execute commands, inspect logs, scan files, mutate records, call providers, create billing records, call live AI, send notifications, SMS, email, expose secrets, or enable live features.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
