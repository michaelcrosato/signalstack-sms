# Codex Blockers

Run number: 21

No active blockers.

## Notes

- `/settings/ai` is a read-only local AI operations view. It displays existing selected AI provider state, fake-provider readiness, deterministic endpoint coverage, local AI usage totals, recent AI usage metadata, and safety boundaries; it does not submit prompts, call live AI, create paid model requests, mutate conversations, create billing artifacts, send notifications, call providers, send SMS, expose secrets, or enable live AI.
- `npm run db:migrate` still requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The documented local value was used for migration check, demo seeding, and E2E.
- `npm run validate` still emits existing warnings about the Next.js ESLint plugin and Node shell argument deprecation, but the command exits green.
