# Codex Blockers

Run number: 22

No active blockers.

## Notes

- `/settings/api` is a read-only local API operations view. It displays static local route inventory, route areas, read/write classification, external-impact classification, route safety notes, and API rate-limit policy; it does not execute handlers, mutate records, call providers, call live AI, call Stripe, send SMS, send email, send notifications, expose secrets, disable rate limits, or enable live messaging, live billing, or live AI.
- `/settings/ai` is a read-only local AI operations view. It displays existing selected AI provider state, fake-provider readiness, deterministic endpoint coverage, local AI usage totals, recent AI usage metadata, and safety boundaries; it does not submit prompts, call live AI, create paid model requests, mutate conversations, create billing artifacts, send notifications, call providers, send SMS, expose secrets, or enable live AI.
- `/settings/webhooks` is a read-only local webhook operations view. It displays existing Twilio webhook route coverage, stored webhook counts, provider/event-type summaries, recent idempotency keys, received timestamps, and safety boundaries; it does not replay payloads, create webhook events, mutate messages or contacts, call Twilio, send automatic replies, create billing artifacts, send notifications, send SMS, expose secrets, or enable live messaging.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
