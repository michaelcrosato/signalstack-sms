# Codex Blockers

Run number: 3

No active blockers.

## Notes

- `codex-runs/FULL_PLAN_RUN_2.md` was already untracked at the start of the run and was left untouched.
- `codex-runs/FULL_PLAN_RUN_3.md` was already untracked at the start of this run and was left untouched.
- The demo path requires the local PostgreSQL database to be migrated and seeded before running.
- The standard `npm run validate` gate runs the smoke Playwright test; the fuller investor demo path is available as `npm run test:e2e:demo`.
- `npm run db:migrate` requires `DATABASE_URL` in the shell; the validation script supplies the local default internally, but direct Prisma commands do not.
- Webhook foundations validate and store Twilio inbound/status events, but status transition processing and live provider-number routing remain future slices.
- Provider settings are read-only readiness metadata. There is still no provider credential storage UI, live send enablement flow, or real Twilio send path.
- The local worker processes due scheduled campaigns through the dummy provider only. It does not yet run continuously, integrate Redis/BullMQ, enforce rate limits, or process Twilio status transitions.
