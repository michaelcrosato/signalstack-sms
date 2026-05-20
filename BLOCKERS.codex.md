# Codex Blockers

Run number: 19

No active blockers.

## Notes

- `/settings/contacts` is a read-only local contact operations view. It displays existing tenant-scoped consent status, CSV import status, tag/list counts, recent import metadata, and recent contact metadata; it does not import contacts, create contacts, update consent, mutate tags/lists, hard-delete records, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for demo seeding and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
