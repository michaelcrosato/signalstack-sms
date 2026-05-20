# Codex Blockers

Run number: 20

No active blockers.

## Notes

- `/settings/team` is a read-only local team operations view. It displays existing organization metadata, membership role/status counts, assigned conversation counts, authored internal-note counts, member names/emails, and safety boundaries; it does not invite users, create users, change roles, suspend members, delete memberships, call Clerk, send email, send notifications, call providers, create billing records, send SMS, expose secrets, or enable live messaging.
- `/settings/billing` is a read-only local billing operations view. It displays existing local billing account status, live billing gate status, Stripe placeholder presence, usage totals, recent usage metadata, and safety boundaries; it does not call Stripe, create subscriptions, create invoices, collect payment methods, charge cards, send email, send notifications, call providers, send SMS, expose secrets, create external billing artifacts, or enable live billing.
- `/settings/audience` is a read-only local audience operations view. It displays existing tenant-scoped tag counts, list member counts, saved segment definitions, and segment update timestamps; it does not create tags, update lists, change contact memberships, evaluate segments for sends, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.
- `/settings/templates` is a read-only local template operations view. It displays existing tenant-scoped template counts, variable names, campaign usage, and text previews; it does not create templates, edit copy, render live outbound messages, schedule campaigns, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.
- `/settings/contacts` is a read-only local contact operations view. It displays existing tenant-scoped consent status, CSV import status, tag/list counts, recent import metadata, and recent contact metadata; it does not import contacts, create contacts, update consent, mutate tags/lists, hard-delete records, call providers, create billing records, send notifications, send SMS, expose secrets, or enable live messaging.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for demo seeding and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
